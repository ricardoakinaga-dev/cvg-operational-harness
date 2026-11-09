# SPEC0265 — Evento autorizado e autenticação de conteúdo

23/10/2026. Task R1 `PROD0624-U19-CONTENT-AUTH-SPEC0265-R1`, claim101; rework documental `PROD0624-U19-CONTENT-AUTH-SPEC0265-R2-PARSER`, claim103. **SPEC_PROPOSED_T3_NOT_SENT / NOT_IMPLEMENTED.** Mesmo Erdos designer; não é parecer independente. R1 imutável; runtime novo `product-content-auth-spec-runtime-r2-parser`. Sem BUILD, código/teste/HTTP/modelo/provider/backup ou mudança de oráculo.

R3 documental pelo Lead: somente a correção SPEC0265-F01 do exemplo E13,
distinguindo o campo ausente, `[]` e `null` no manifesto explícito. O parecer
R1 REVISE permanece preservado; conformidade do mesmo crítico pendente.

## 1. Autoridade e evidência

[0179](0179_shift_consumer_reliability.md), SHA `988192fe48737b4571ed659f051e22f3a9283d5c433e7c6c078e1dd0f7be86c3`, continua integralmente aprovada para BUILD local sintético pelo [receipt](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/human-t3-approval.json), SHA `00c49ece2fec0a260cfed658dec5ed64a20e2b797984d38e0330bb7fd2ad1914`. §5.3 exige fonte autorizada síncrona/inline inválido retido, §10 exclui segredos; não é possível conservar wire com credencial byteexato e simultaneamente excluí-la de volume/backup. Não reaprovar0179. Wrapper, scopes, normalizador, feature e política de abertura abaixo são **delta novo de schema/segurança T3**, conforme [AGENTS07](../07_agents/AGENTS.md), não aprovação implícita do HOW nem autorização atual de implementar.

Inputs obrigatórios conferidos: HOW `f1c03adbb4240a6c1e77972e9ce4d7d3989120a2a7e39399061ac730c8abd1f3`; AP011r2 HANDOFF `5ef8b7b3d3cd287133492cb833d776470bfb24a8d40e3a23799e966f8231ebee`; seis fontes físicas readonly com hashes no apêndice. Store do HOW (`b5d3…`) difere do Store congelado r2 (`50db…`): são observações em instantes diferentes; o desenho usa este último, sem importar R5 mutável.

[Causa primária](../04_audit/evidence/PROD0624-EXEC-20261023/u19/canary-cause-recon-r1/source-trace.json): server mantém received.bytes, assistant encaminha rawEnvelope, prepareInbound publica raw. O producer Evolution contém root apikey. [Prova física do Parent](../04_audit/evidence/PROD0624-EXEC-20261023/u19/canary-cause-recon-r1/physical-copy-observation.json) encontrou1 cópia na origem e1 no backup real330, bytes iguais. A assert de origem falhou; a assert seguinte de backup não foi atingida naquele teste, embora o Parent tenha conferido a cópia física. [Checkpoint](../04_audit/evidence/PROD0624-EXEC-20261023/u19/checkpoint-1956-verification/lead-observation.json):27=26PASS/1FAIL, tipos exit0, não perfil aceito. Receipt selecionado AP011 é outra rota e não causa esse vazamento. Rejeitar permanentemente o positivo Evolution não resolve a obrigação de suporte. Não alterar fixture/canário/asserts, filtrar backup ou reescrever originais.

## 2. Representações e identidade

**TARGET proposto:** só conteúdo Evolution do perfil local `evolution-2.3.7-content-v1` ganha wrapper. Perfil é alvo de parser local, não prova de versão/identidade do servidor remoto. WAHA e fontes normalizadas legadas continuam nas representações existentes quando seguras. Receipt AP011 mantém `provider-event-selected-fields-canonical-v1`, separado deste conteúdo. Nenhum scope é inferido do nome do arquivo.

O evento retido é o objeto JSON inteiro recebido, retirando **somente a propriedade própria root cujo nome decodificado é `apikey`**. Pode estar ausente. Não retirar propriedades aninhadas chamadas apikey, campos data/message/text/MIME/base64, metadata extra, sender/instance/server_url/date_time ou IDs. Objetos são dicionários de valores JSON, não whitelist de metadados. Chaves perigosas como `__proto__` continuam dados em dicionário sem protótipo, nunca atribuição em objetos comuns. Nenhuma reescrita clínica, Unicode, whitespace de string, MIME ou base64. Escaping/whitespace externos, ordem de chaves e grafia numérica equivalentes não são wire original; nenhum hash do wire/credencial descartada será produzido ou persistido.

Tipos JSON fechados no wrapper, authContext e descriptor; `J` admite recursivamente todos os campos do evento dentro dos limites/números de§3. Ausência opcional não é null. `H` é hex minúsculo64; `T` UTC ISO com milissegundos; `U` inteiro seguro não negativo. Não strip de campos desconhecidos em objetos strict.

```ts
type Scope = 'provider-content-event-auth-envelope-separated-v1'
type J = null | boolean | number | string | J[] | { [key: string]: J }
type ContentEnvelopeV1 = {
  schemaVersion: 1
  rawScope: Scope
  normalizer: 'evolution-2.3.7-content-v1'
  authContext: {
    provider: 'evolution'
    session: string
    verifiedAt: string
    credentialSlot: 'content-local-header-v1'
  }
  event: { [key: string]: J }
}
type ContentDescriptor = {
  messageKey: string
  mime: 'application/json'
  bytes: number
  sha256: string
  path: string
  stage: 'published'
  envelopeScope: Scope
}
```

Refinements obrigatórios: wrapper tem exatamente5chaves; authContext exatamente4. provider/normalizer/scopes são literais; session não vazia≤256 unidades UTF-16, igual ao session configurado e a event.instance. event.event=`messages.upsert`; event.data é objeto, data.key é objeto com id não vazio≤256, remoteJid string, fromMe boolean; data.message é objeto. É necessário obter uma mensagem inbound aceita pelo parser puro Evolution existente, sem construir cliente/chamar rede. fromMe=true ou evento de outra classe não vira nova entrada; regra de ignorar vale somente após gates de auth/JSON/privacidade, sem publicar. Vários candidatos de mensagem de tipos diferentes no mesmo objeto são ambíguos:400; nunca escolher uma identidade divergente.

`verifyEnvelope` desembrulha somente com descriptor.envelopeScope=S e feature publicada, valida wrapper strict e usa `EvolutionClient.prototype.parseWebhook(event, admitted.receivedAt)` como parser puro. Revalidar InboundEnvelopeSchema, provider/session/messageId/member/kind/text/mimetype/metadata normalizados e mediaRef de fonte. Mesmo tratamento atual de samePhone e externalização somente do ponteiro local; não usar conta atual para reconstruir histórico. Qualquer divergência com messageKey/V2 é falha. Não criar parser clínico paralelo ou chamar provider em replay. O wrapper não contém normalized InboundEnvelope como se fosse wire.

Parser completo já reconciliado **antes do crítico/T3**: `whatsapp-frozen.ts`, SHA `3943f362c9f8439733d968c2084b3d3f1bd5d1672143ce46ac433c1fef866e2f`, input24, método378–423, helpers68–76; normalizePhone usa domínio congelado251–254. O arquivo20:35 difere em fullhash do contexto19:52 segundo captura do Parent; isto não estabelece composição wholeR5 coerente com as seis fontes19:58. Nenhum parser foi executado.

Contrato puro lido: obj só aceita objeto truthy não-array; str só string com length>0, sem trim. event passa por toLowerCase().replace('\_','.') (somente primeiro underscore), exigindo resultado messages.upsert. data/key/content devem ser objetos; id e remoteJid strings não vazias; fromMe===true retorna undefined, os demais valores não bloqueiam o parser legado. Sufixo PN é exatamente @s.whatsapp.net, case-sensitive; grupo/LID/outro sufixo retorna undefined. normalizePhone é value.split('@')[0].replace(/\D/g,''), não valida membro por si só; cadastro e caps continuam no caller.

audio=obj(message.audioMessage), image=obj(message.imageMessage), extended=obj(message.extendedTextMessage). kind é audio se objeto audio existir (inclusive{}), senão image se existir, senão text. text é primeira string não vazia entre conversation, extended.text, image.caption, senão ''. Só kind text com text.trim() vazio é ignorado; valores de texto são preservados sem trim. MIME é primeira string não vazia audio.mimetype ou image.mimetype. Para audio/image, inline=str(data.message.base64): se presente mediaRef='base64:'+inline, senão 'id:'+id; MIME só é emitido se presente. Para text não há mediaRef/mimetype. data.base64 é metadata preservada, **não** inline para esse parser. Retorno completo: provider evolution, messageId=id, fromPhone normalizado, kind/text, opcionais acima e receivedAt exatamente do argumento local, nunca date_time remoto.

Gate novo é deliberadamente mais restrito que esse parser, sem alegar compatibilidade de todas as formas legadas:

- Alias que o parser aceita (MESSAGES_UPSERT/messages_upsert etc.) mas não é string literal messages.upsert→400invalid_payload no writer novo; evento cujo resultado normalizado é outra classe continua ignored200 sem documento após gates.
- fromMe false boolean é forma inbound nova; true boolean continua ignored200. Ausente/null/número/string antes aceitos por !==true→400invalid_payload novo. Não converter string 'false' em false.
- R1 já recusa candidatos de tipos diferentes: definir candidatos por audio/image objetos e texto explícito str(conversation) ou str(extended.text). Mais de um tipo→400 novo; legado usa precedência audio→image→text. Caption dentro de image não é tipo separado; conversation+extended são mesmo tipo e conservam precedência de texto. Não retirar os campos conflitantes para admitir.

Essas três restrições, caps e representação novos são parte explícita da T3 proposta; não ampliar nem atribuir esses gates ao parser legado. Fontes legadas seguras continuam usando o parser real sem aplicar retroativamente as três restrições. Media_store311–393 já chama prototype.parseWebhook com receivedAt admitido, sem construir cliente;378–423 não acessa this/#options nem rede. Novo replay desembrulha e aplica o gate do perfil antes da mesma chamada pura, comparando metadados completos. WAHA/normalizePhone/cadastro não mudam. E04/E05 corrigem somente a posição inline comprovada; não alteram texto/MIME/base64 ou decoder de mídia.

Descriptor é o MediaDescriptor existente acrescido de `envelopeScope?`, com a única opção S. Campo permitido somente para inbound/\*.json/application/json; proibido em mídia binária, receipt ou source normalizado legado. Novo descriptor: bytes1..26214400, SHA dos bytes retidos, path `^inbound/[a-f0-9-]{16,64}\.json$`, stage published, messageKey=`JSON.stringify([provider,session,id])`. Sidecar exato `<path>.json`, bytes do canonical(descriptor)+LF. Sem scope segue schema legado; com scope deve haver wrapper e vice-versa. Não aceitar scope desconhecido, campo extra, scope ausente no sidecar ou hash só do event.

`authContext` é fato LOCAL da autenticação/cadastro já verificados. Não é prova independente de provider, MAC revalidável offline, nem contém header/token/HMAC/hash de segredo. verifiedAt é clock local da admissão original; jamais recalcular no replay/restore. Rootapikey não autentica, não seleciona membro/session e não altera inputDigest.

## 3. JSON, números, privacidade e recursos

Antes de JSON.parse: decoder UTF-8 fatal, sem BOM/substituição; rejeitar strings JSON com surrogate isolado. Scanner lexical limitado reconhece grammar JSON estrita e guarda Set de chaves **decodificadas por objeto**, incluindo `apikey` versus `\u0061pikey`, pares surrogate válidos e colisão `x`/`\u0078`. Qualquer repetição, mesmo valor igual, é400 `invalid_json`; não usar JSON.parse/reviver após perda das duplicatas para decidir. Não normalizar NFC/NFKC/case: chaves Unicode distintas continuam distintas. Nada de parser permissivo, eval, regex única como parser ou novo pacote.

Números novos: token≤64bytes, expoente explícito entre−308 e308, finito. Antes de converter, comparar **valor decimal exato do token** com valor decimal da serialização ECMAScript `JSON.stringify(Number(token))`, por coeficiente/sinal/expoente decimais limitados; zeros finais e expoente normalizados, sem arredondar com Number para a comparação. Se diferentes:400 `numeric_precision`. Inteiros devem ainda estar em [−9007199254740991,9007199254740991]; rejeitar−0 em qualquer grafia. Assim1.0/1e0 podem virar1 sem mudança do valor JSON;0.1 permanece0.1;9007199254740993,1e400,1e-999 e decimal arredondado são recusados **antes de publicar**. Isso não promete preservação da grafia numérica nem exatidão IEEE binária de0.1; preserva o valor decimal JSON reemitido no perfil suportado. Números fora do perfil não são silenciosamente arredondados, convertidos a string ou mantidos em campo secreto alternativo. Essa restrição é parte do delta T3, não suposta garantia legada.

Rootapikey, quando presente: string ASCII visível0x21..0x7e,16..256bytes; outro tipo, null, vazio, whitespace ou formato fora do perfil→400 `invalid_payload`. É descartado do evento após essa validação, nunca logado/hasheado. Escapes JSON válidos são decodificados antes. Headers/configs já fornecidos ao processo autenticam independentemente; não ler Vault/envfiles novos.

Echo conhecido: conjunto em RAM das credenciais de autenticação já entregues ao processo (até4slots ativos/retiring, cada uma≤4096bytes) e da rootapikey desta request. Exceder orçamento de configuração inibe startup, não desliga inspeção. Procurar ocorrência exata completa da credencial como subsequência nos nomes/valores string decodificados de event e no UTF-8 serializado; inspecionar também strings base64 estritas com ou sem prefixo `base64:`, de forma streaming, sem guardar decode em disco, incluindo metadados extras. Não buscar “palavras secretas”, não apagar por nome, não transformar dados: ocorrência conhecida→400 `credential_echo`, zero documento/frame/ACK accepted. Texto com palavra apikey sem o valor conhecido é preservado. Inline inválido que não é base64 continua string original; se contém eco literal, é recusado por privacidade. Credenciais desconhecidas/codificações arbitrárias, heapzero e operador escrevendo DB/arquivos fora do protocolo não são prometidos. Não persistir canário, digest, trecho, path identificável ou corpo em logs/health/Gbrain/erros.

Caps fechados: wire≤26214400bytes e wrapper **também**≤26214400bytes, JSON antes/durante parse com profundidade≤64, total de nós≤65536, total chaves≤65536, array≤65536itens, chave≤512 unidades UTF-16, soma de strings decodificadas UTF-8≤26214400bytes. Texto/IDs continuam16384/256; mídia decodificada≤10485760bytes; linha V2≤1048576bytes. Scanner conta incrementalmente, memória proporcional aos limites e FDs só ancestrais ativos, sem cache de toda árvore. Sem truncar objetos/arrays/strings/metadados. Excesso estrutural/body/saída→413 `too_large`; JSON/número ambíguo→400. Medir tamanho UTF-8 da saída **antes** de alocar buffer final: wrappers/escapes/serialização podem expandir; output excedido é413, não raise do cap. Canonical: ordenação recursiva de chaves por code units UTF-16 do canonical existente, arrays/valores preservados, JSON.stringify de cada primitivo e LF final. Não pretty-print em produção.

Headers5s/body10s/request15s,16conexões/4corpos autenticados e fila1000 com reserva de controle permanecem0179. Não aumentar HTTP2s/child10s/test15s/outer90s de provas existentes. Novo scanner/echo/sort deve medir custos dentro desses caps; nenhum timeout físico de fsync é prometido. Bounded parsing não prova latência universal; I/O bloqueado exige supervisor. Não acrescentar limite minúsculo de documentos retidos para ficar verde. Scan de volume pode levar tempo: prontidão fica ausente até terminar, processando documento a documento e cedendo entre chunks64KiB; sem efeitos ou partial-safe admission durante scan incompleto.

## 4. Callers, digest e respostas

Fronteira server `/webhooks/evolution`: auth header vigente+provider da rota→body contado+JSON/duplicatas/números→parser puro+cadastro/session/membro+caps→remoção rootcredential+eco conhecido→wrapper pré-medido. Session/membro vindos do body são verificados depois do parse e antes de qualquer documento/frame/ACK. Auth ausente/incorreta é401, ainda que rootapikey correta; rootapikey ausente/presente/rotacionada com header correto usa o mesmo caminho. Nunca gerar documento de conflito para request não autorizada/inválida. Fila cheia503 antes de nova publicação; inspeção da request não implica commit.

Mudança de chamada proposta: `assistant.admit(message, source?: Uint8Array | AuthorizedContentMaterial)` e `ShiftStore.prepareInbound(message, session, source?: Uint8Array | AuthorizedContentMaterial)`. Novo material interno, marcado por identidade privada em RAM, contém somente `{bytes, envelopeScope:S}` já autorizado; construtor somente na fronteira validada, sem export que converta JSON arbitrário em fato de autenticação. Store revalida scope/schema/ligação, não confia no brand para conteúdo físico. Uint8Array legado continua apenas para representação segura existente; HTTP Evolution do novo perfil nunca cai em raw por ausência/erro do material. Replay valida dados persistidos sem brand e sem afirmar autenticação atual.

`MediaStore.publish` recebe opção `envelopeScope?:S`; deve preservá-la no descriptor, sidecar e índice/reuso. `verifyEnvelope`, `envelopeDescriptor`, inventory, sourceMessage, verifyEvidence e replay de inbound/conflict passam a discriminar scope; não tentar normalizedparse como fallback para wrapper inválido. Domínio strict ganha somente o campo definido, e journal feature antes dos novos dados. Nenhum public config/dependency/CLI ou schema clínico é mudado por esta SPEC. Paths candidatos de implementação ficam com Einstein, sob task futura, não com o designer.

inputDigest permanece **exatamente** o algoritmo congelado Store1102–1134: SHA256(canonical({key,memberPhone,kind,text,mimetype,inline})); mimetype é split(';')[0].trim().toLowerCase() ou null. inline=null quando não inline; válido={sha256 dos bytes decodificados,valid:true}; inválido={sha256 da mediaRef inteira original,valid:false}. memberPhone é o membro normalizado admitido, key a tupla atual. Não incluir raw wire, rootcredential, wrapper hash/authContext/verifiedAt, event metadata não clínica ou credentialSlot. Esses campos podem variar sem uma nova entrega clínica.

| Resultado                             | HTTP e corpo exatos                       | Persistência/efeito                                                                                                           |
| ------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Novo aceito                           | 200 `{"accepted":true}`                   | Só após documento/sidecar/manifest/frame e fsync retornarem; sem efeito antes da admissão                                     |
| Duplicate clínico                     | 200 `{"accepted":false,"duplicate":true}` | Revalidar evidência anterior, nenhum novo documento/frame/feature/reenvio; credencial rotacionada não muda digest             |
| Evento ignorado                       | 200 `{"accepted":false}`                  | Nenhuma nova entrada; não ignora gates de auth/privacidade                                                                    |
| Auth inválida                         | 401 `{"error":"unauthorized"}`            | Nada persistido                                                                                                               |
| JSON/duplicata/número inválido        | 400 `{"error":"invalid_json"}`            | Nada persistido; numeric_precision é razão interna estável, sem valor no erro                                                 |
| Payload/scope/session/membro inválido | 400 `{"error":"invalid_payload"}`         | Nada persistido                                                                                                               |
| Echo conhecido                        | 400 `{"error":"credential_echo"}`         | Nada persistido, sem logs do valor                                                                                            |
| Cap                                   | 413 `{"error":"too_large"}`               | Nada publicado, sem truncamento                                                                                               |
| Mesma key, conteúdo clínico novo      | 409 `{"error":"idempotency_conflict"}`    | Só depois de documento autorizado+sidecar e inbound_conflict_recorded duráveis; anterior preservado; zero tarefa/reenvio novo |
| Hold/I/O/feature/scan indisponível    | 503 `{"error":"storage_unavailable"}`     | Readiness falsa; pode haver órfão/commit incerto conservado; não ACK accepted                                                 |
| Fila cheia                            | 503 `{"error":"queue_full"}`              | Antes de publicação, Retry-After30; reserva de controle intacta                                                               |

Numeric_precision/negative_zero são detail interno sem token numérico; ambos400invalid_json. Wiretimeout continua408request_timeout0179. A resposta401 tem precedência sobre body/payload diagnostics; cap físico pode interromper leitura independentemente, sem revelar dados. Erro após commit pode retornar503 ou nenhum ACK; isso não prova ausência de commit e retry reabre evidência/dedupe. Nada promete atomicidade entre fsync-return, resolução da função, HTTP write e recebimento remoto.

Mudança de apenas metadata não clínica/credencial, com mesmo inputDigest, é duplicate: primeiro evento autorizado retido continua a fonte, sem promessa de arquivar cada retransmissão HTTP. Mudança de texto/inline gera409 com **novo wrapper autorizado**, sem wire secreto. Repetição de conflito já commitado retorna409 sem republicar; primeiro verificar sua evidência física. Ingress nunca transcreve/organiza modelo para declarar aceite.

## 5. Features, publicação e crashes

ReaderFeatures mantém manifest.version2, com set fechado dos literais `delivery-receipts/1` (D) e `authorized-content-envelope/1` (A). Writer emite ausente para vazio, [A], [D] ou [A,D] em ordem lexical. Reader aceita ausência/[] como vazio e ambas ordens de [A,D], mas exige elementos únicos; duplicata não é deduplicada silenciosamente. Unknown/tipo inválido→UNSUPPORTED_READER_FEATURE antes de recovery, load de segmento, truncamento ou reparo; nunca tratar frame desconhecido como tail. Validar manifesto atual e os retidos necessários de forma conservadora, sem fallback para revisão anterior para contornar unknown. Leitor antigo deve recusar A; matriz real de versões precisa provar isso antes de habilitar writer. AP011 r2 implementa **somente D**, não A nem união2.

Sob o mesmo WriterLock exclusivo: pré-validar wrapper/descriptor/V2frame completo e seu limite1MiB **em RAM**; unir features requeridas com as já publicadas. Preservar D sempre que houver receipts/outbox deliveryBinding/deliveryDueAt; não zerar features ao escrever conteúdo. Publish/fsync de manifest-r<N+1>, temporário exclusivo, rename do atual e dirsync vêm **antes de qualquer novo wrapper/sidecar ou referência que precise de A**. Histórico e temporários preservados/inventariados. Erro de publicação não volta ao manifest antigo nem prossegue com dados novos: inibir/503. Visibilidade após erro de sync é incerta, não inferir rollback atômico.

Depois: criar inbound/UUID.json O_EXCL/NOFOLLOW/0600 e sidecar JSON exato, fsync dos dois+dirsync (dir0700); só então inbound_recorded ou inbound_conflict_recorded em transação CAS/transitionId/hashchain V2 e fsync; só depois ACK. Journal valida necessidade de A em todo caminho de commit/append e replay, inclusive chamada direta interna, não apenas HTTP. Dedupe acontece antes de feature upgrade quando não há dados novos. Scope em media diferente, A ausente em frame/doc novo, A desconhecida ou sidecar divergente recusa readonly e writable, sem recriação. Descriptor/envelopeSource não altera seq/UUID/hashchain atuais fora da transação normal.

| Cutpoint                                      | Reabertura/retry exigidos                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Antes feature                                 | Sem novo doc/frame; repetir só após nova auth                                                                         |
| Feature retida/temp/rename sem sync concluído | Conservar todos; reabrir valida manifesto/feature, sem inferir ACK; falha inibe                                       |
| Feature durável, nenhum doc                   | Feature pode ficar anunciada sem uso; não downgrade                                                                   |
| Documento sem sidecar/parcial                 | Órfão incompleto conservado, nunca promovido por nome; nenhum ACK/efeito                                              |
| Par completo sem V2                           | Órfão autorizado; revalidar tudo antes de reuse e somente nova request autenticada pode referenciá-lo                 |
| Frame escrito sem fsync/ACK                   | Aplicar regras de prefixo existentes; cauda isolada preservada; retry verifica se houve commit; zero reaplicação cega |
| Commit fsynced, ACK perdido                   | Duplicate na nova auth; nenhum reenvio/reobservação AP011                                                             |

Retry de órfão: índice é aceleração, cada hit reabre bytes/sidecar. Pode reutilizar par completo com provider/session/key/inputDigest iguais, scope/schema válidos e sem echo conhecido, guardando authContext histórico; não trocar verifiedAt para fingir autenticação nova no documento. Primeiro evento de conteúdo normalizado igual prevalece, inclusive metadata não clínica diferente na repetição. Múltiplos pares elegíveis: escolher path lexical mínimo após validar todos candidatos da key, conservar demais; incompletos não são sucesso. Scan ainda incompleto→503 até classificação, sem limite de quantidade D4 nem sucesso parcial. Sem crédito por hash de arquivo órfão não validado. Se houver divergência de descriptor/bytes/conflicting refs, inibir e conservar, não “corrigir” sidecar.

## 6. Legado e hold antes de qualquer efeito

Reader novo faz preflight de privacidade antes de iniciar scheduler/outbox/network adapters ou responder readiness positiva: validar referências e classificar também órfãos/cópias de envelope nos namespaces geridos inbound/media/recovery/migração, incluindo pares incompletos e conflict docs. Abrir só regular/nofollow/confinado, limites por documento e scan incremental, nunca logar conteúdo. Falta de classificação, erro I/O, formato de envelope ambíguo ou symlink mantém inhibit; não abrir readiness enquanto processa só uma parte.

Classificação não tenta parsear áudio, segmento journal ou tail isolada como envelope JSON: usar tipo/path/sidecar/referências de origem e metadados de recovery/migração existentes. São candidatos a envelope todos os inbound/\*.json não-sidecar, conflict copies do mesmo documento e suas cópias identificadas por esses metadados; JSON application/json em media exige o mesmo exame. Binários conhecidos e outros documentos reconhecidos conservam seu tipo e hashes, sem convertê-los em conteúdo. Candidato incompleto/desconhecido fica não classificado/hold, não é omitido do inventário. Hash físico de original legado **retido** continua sendo hash de documento protegido; não autoriza secretfree nem calcular um digest novo do wire descartado da request.

Legado Evolution com rootapikey própria em qualquer valor/tipo é `legacy_content_credentials`: hold local determinístico, effectsAllowed=false/readiness=false; endpoints de nova admissão503, nenhum reenvio/job/modelo/provider. Mesmo se a chave já rotacionou ou provider envia novamente com header correto. Em readonly, permitir diagnóstico sanitizado de hold/inventário e conservar bytes; não expor sourceMessage de envelope inseguro como fato liberado. Em writable também não migrar/reconciliar/reparar/truncar automaticamente para retirar segredo. Repetir preflight em **todo startup**, antes de efeitos: o hold decorre dos documentos preservados e não pode desaparecer por restart ou comando retomar assistente. Nenhum endpoint de release deste hold é introduzido. Mensagem de health só reason/counts sem segredo/digest/path privado.

Legado seguro sem rootcredential e fontes normalizadas válidas continuam legíveis com esquema/bytes anteriores, sem adicionar scope/feature ou reserializar; não aplicar retroativamente o domínio numérico novo para regravar metadados antigos. Gates de identidade/hash/privacidade permanecem. Envelope legado malformado/inclassificável não é declarado seguro. Inspeção conhecida de segredo aninhado/eco pode igualmente inibir; não inventar mecanismo capaz de reconhecer segredo desconhecido. Scan cobre documentos do protocolo: não certifica arbitrary operator writes ou todas as encodings; se há arquivo gerido desconhecido, status é não classificado/hold, nunca promessa de volume secretfree.

Remediação de volume antigo exige decisão/procedimento offline próprio para revisão/export a NOVO volume com autoridade explícita, preservando original/recovery/segredos como evidência protegida; **não é migration autorizada nesta SPEC**. Não há autosanitize, rewrite, quarantine/delete ou waiver D4. Backup comum que exige conjunto sem credencial deve recusar classificação insegura; uma cópia forense fiel pode conservar o segredo, mas não se chama backup secretfree/VERIFIED admissível. A prova atual de cópia330 com canário permanece falha, não é apagada por esta proposta.

Este novo hold de privacidade no startup é obrigação **futura** deste delta, não alegação de já estar implementado. Não fecha o hold persistente de startup pós-restore da outra interface, nem FS namespace/WriterLock arbitrarysameUID. ReadOnly storageHealthy=false por si só não prova corrupção; razão de inhibit precisa ser distinguida.

## 7. Handoff exato para backup e AP011

Não alterar backup330ec/testf357; [0264](0264_shift_backup_publication_reverification.md) SHA `b986d8dec096410e534004d5b405e508aabddd6e87f41fc89b0e0d069dfd6cc7` está humana PENDING, não implementada. Finalização/ACK/reverificação0264 é um contrato; conteúdo/reader0265 é outro. Aprovar um não concede o outro nem aceita backup completo.

Delta de conteúdo a handoff futuro: (1) A na união readerFeatures e bytes/revision/manifests efetivos; (2) MediaDescriptor.envelopeScope=S e sidecar completo; (3) wrapper5chaves+canonicalUTF8LF inteiro; (4) preflight legacyhold; (5) projeção inbox novo opcional abaixo. Sem retirar arquivo/campo para passar schemas antigos. Todos documentos regulares, órfãos/recovery/conflicts/temp/manifestos continuam inventory bytes/hash e cópia D4; nada de filtrar apikey no backup.

Novo `StoreProjection.inbox[]` acrescenta **somente para entrada com envelopeScope S**:

```ts
type InboxContentProjection = {
  authorizedContentEnvelope?: {
    path: string
    bytes: number
    sha256: string
    envelopeScope: 'provider-content-event-auth-envelope-separated-v1'
  }
}
```

Valores são exatamente o descriptor físico admitido, incluindo path e hash completos. Campos antigos da inbox permanecem, inclusive textSha256/mediaRefSha256/stage/retry; entradas legadas omitem o opcional. Não criar estado/projeção vazia para reader desconhecido. SourceMessage/replay comparam texto/MIME/inline integral e referências; restore não autentica header antigo ou refaz authContext. Reader/backup sem A/schema/projeção deve recusar conservando evidência.

AP011r2 é preservado inteiro: namespace receipts/event+sidecar e refs adicionais; união D+A; vertical.outbox.deliveryBindingSha256/deliveryDueAt e top-level delivery.receipts/deadlines com authContextSha256/documents/associationSha256/observationSha256/committedAt/timing e ausência exata. Expired/unmatched/matched/UNKNOWN e deadline violation não são apagados; restore não fabrica observação nem reenviar accepted/uncertain. ContentScope S nunca substitui rawScope selecionado de receipt. Backup qualificado precisará Store REAL com ambos readers e projeção completa, não só contagens ou typePASS; novo handoff deve congelar fontes e exigir inventário/hash/projeção/hold+NEWEMPTY restore antes de qualificar qualquer caller.

## 8. Provas futuras e conclusão de desenho

Tabela é requisito futuro, **não executado** nesta rodada. Manter original canary-positive content+receipt+backupREAL, **todas** assertions e200/duplicate semantics; não aceitar400 geral como correção. Modelo/Whisper/providerreal0 e demais contadores originais. Manter R3F01 quatro FAILs/PV10timeouts/R10rejeições e fontes provisórias históricas, sem PASS herdado.

| Classe               | Predicado discriminante futuro                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producer obrigatório | Mesmo Evolution realistic content+AP011 receipt HTTP200; dados preservados, canário zero em todo volume e backup REAL; associação/observação originais intactas |
| Texto/inline/invalid | Dois providers e tipos atuais; wrapper preserva metadata/MIME/base64/texto e mídia inválida para review; áudio não chama modelo clínico                         |
| Auth/dedupe/rotation | Headererrado401/no docs; rootkey ausente/presente/rotacionada nunca auth; mesmo inputDigest/duplicate/no resend, mudança clínica409/conflict doc seguro         |
| Parser/recursos      | Chaves duplicadas literais/escaped/nested, surrogate inválido, precision/−0, wire/outputcap e overhead real; zero doc/frame, sem capraise                       |
| Echo                 | Valor conhecido em text/key/metadata/base64/inline recusa antes publicação; palavra apikey e strings clínicas legítimas preservadas                             |
| Bindings             | Scope/wrapper/descriptor/sidecar/hash/key/session/tamper/symlink/missing divergentes recusados RO/RW, sem reparar                                               |
| Features/crash       | Todas combinações/ordens/duplicates/unknown, oldreader antes recovery/truncate; cutpoints reais de§5, orphan/retry só um inbound e zero efeito duplicado        |
| Legado               | Seguro legível byteigual; credential-bearing, órfão inseguro e scan incompleto hold em todo startup antes efeitos; retomar não remove hold, D4 completo         |
| Backup               | Novo reader A+D, content+receipts+orphans+tails/manifests, fullprojection e NEWEMPTY restore, UNKNOWN/outbox no resend; sem supor0264 implementada              |

Novos testes sintéticos usam mesmos exports reais e fontes/deps congeladas, offline, caps existentes10child/15test/HTTP2/outer90; campanhas AP011 com perfil próprio permanecem do owner. Registrar firstRED, syscall stage realmente atingido, argv/cwd/env/timing/actualexit/rawSHA/PREPOST/PIDgroups; não repetir para esconder falha. Se novo recurso/perfil/provider não cabe, proposta concreta e revisão antes de elevar. Nenhum Node produto/test/HTTP/probe nesta task; somente stdlib para exemplos e formatter existente.

Lead faz revisão técnica e crítico documental fresco sobre este resultado concreto com parser agora incluído; só depois pergunta T3 específica0265, sem reaprovar0179. Não há T3 enviada/aprovada nem BUILD concedido. Parser/callers estão especificados por leitura, não qualificados por execução; implementação futura do owner prova caller errors/prefix/crash/handoff backup, sem adiar o desenho do mapper. U19/U21/AP011 integral/fidelidade/24unidades42critérios/produção permanecem abertos. Designer entrega payload local; Parent faz append/readback Gbrain.

## 9. Exemplos estáticos e hashes dos inputs

Os18 exemplos anexados são documentos de desenho, não respostas/commits/provas executados. Credencial ilustrativa é sintética, só em input de exemplo/expectativa de recusa; nunca nos wrappers de saída aceitos. Casos de wire inválido usam string JSON dentro do exemplo para preservar duplicatas/números sem um parser ocultar o defeito. Cada exemplo fica em arquivo próprio, com SHA no manifesto; comentários de preservação aplicam-se somente a cada bloco literal canônico vinculado, não ao arquivo Markdown/TS. Controles de grandes caps são fórmulas de tamanho, não arquivos de25MiB. Nenhum schema de produto foi implementado para gerar esses dados.

### E01

<!-- prettier-ignore -->
```json
{"auth":"already verified local header and member","descriptor":{"bytes":507,"envelopeScope":"provider-content-event-auth-envelope-separated-v1","messageKey":"[\"evolution\",\"synthetic-session\",\"m0265\"]","mime":"application/json","path":"inbound/02650000-0000-4000-8000-000000000001.json","sha256":"1092bf47727a90c37c49d01b19791d8b033afad957a7ed5ba530cd7687ae3300","stage":"published"},"expectedHTTP":200,"id":"E01","inputDigest":"d332329938afe4a6564791e8c7396650f3794010e7228167d1a6662c7c538226","title":"wrapper e descriptor completos; material de saída, não wire","wrapper":{"authContext":{"credentialSlot":"content-local-header-v1","provider":"evolution","session":"synthetic-session","verifiedAt":"2026-10-23T20:00:00.000Z"},"event":{"data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"ajuda"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"normalizer":"evolution-2.3.7-content-v1","rawScope":"provider-content-event-auth-envelope-separated-v1","schemaVersion":1}}
```

### E02

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":200,"duplicate":true,"inputDigest":"d332329938afe4a6564791e8c7396650f3794010e7228167d1a6662c7c538226","newDocuments":0},"headerAuthenticated":true,"id":"E02","inputEvent":{"data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"ajuda"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"priorKey":"[\"evolution\",\"synthetic-session\",\"m0265\"]","title":"rootapikey ausente não dispensa header"}
```

### E03

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":200,"duplicate":true,"inputDigest":"d332329938afe4a6564791e8c7396650f3794010e7228167d1a6662c7c538226","resend":false},"headerAuthenticated":true,"id":"E03","inputEvent":{"apikey":"SYNTHETIC_0265_TRANSPORT_B","data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"ajuda"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"priorKey":"[\"evolution\",\"synthetic-session\",\"m0265\"]","title":"rotação só rootapikey é duplicate clínico"}
```

### E04

<!-- prettier-ignore -->
```json
{"expected":{"clinicalModelCalls":0,"codecValidation":"pure parser specified; codec not executed","decodedHex":"4f676753","retainedEvent":{"data":{"key":{"fromMe":false,"id":"a0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"audioMessage":{"mimetype":"audio/ogg"},"base64":"T2dnUw=="}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"sourceMediaValue":"base64:T2dnUw=="},"id":"E04","inputEvent":{"data":{"key":{"fromMe":false,"id":"a0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"audioMessage":{"mimetype":"audio/ogg"},"base64":"T2dnUw=="}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"title":"inline sintético preservado como valor; não prova codec"}
```

### E05

<!-- prettier-ignore -->
```json
{"expected":{"discard":false,"modelCalls":0,"retainedBase64":"%%%invalid%%%","reviewRequired":true},"id":"E05","inputEvent":{"data":{"key":{"fromMe":false,"id":"a0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"audioMessage":{"mimetype":"audio/ogg"},"base64":"%%%invalid%%%"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"title":"inline inválido retido, sem decode permissivo"}
```

### E06

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":400,"documents":0,"error":"credential_echo","frames":0},"id":"E06","inputEvent":{"apikey":"SYNTHETIC_0265_TRANSPORT_A","data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"eco SYNTHETIC_0265_TRANSPORT_A"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"title":"eco conhecido em texto recusa sem arquivo"}
```

### E07

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":400,"documents":0,"duplicateDecodedKey":"apikey","error":"invalid_json"},"id":"E07","title":"colisão escaped da chave root","wire":"{\"event\":\"messages.upsert\",\"apikey\":\"SYNTHETIC_0265_TRANSPORT_A\",\"\\u0061pikey\":\"SYNTHETIC_0265_TRANSPORT_B\"}"}
```

### E08

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":400,"duplicateDecodedKey":"x","error":"invalid_json"},"id":"E08","title":"duplicata aninhada não pode sumir no parse","wire":"{\"metadata\":{\"x\":1,\"\\u0078\":2}}"}
```

### E09

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":400,"documents":0,"error":"invalid_json","reason":"numeric_precision"},"id":"E09","title":"número maior que safe integer não arredonda","wire":"{\"metadata\":{\"n\":9007199254740993}}"}
```

### E10

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":200,"canonicalNumbers":["0.1","1","1"],"retainedMetadata":{"integer":1,"ratio":0.1}},"id":"E10","inputEvent":{"data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"ajuda"}},"event":"messages.upsert","instance":"synthetic-session","metadata":{"integer":1,"ratio":0.1},"sender":"5511900000009@s.whatsapp.net"},"numericTokens":["0.1","1.0","1e0"],"title":"valores numéricos roundtrip; grafia equivalente não é wire"}
```

### E11

<!-- prettier-ignore -->
```json
{"expected":{"HTTP":400,"documents":0,"error":"invalid_payload"},"headerAuthenticated":true,"id":"E11","inputEvent":{"apikey":null,"data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"ajuda"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"title":"credential root null nunca autentica"}
```

### E12

<!-- prettier-ignore -->
```json
{"construction":{"baseWireBytes":285,"baseWrapperBytes":533,"paddingChar":"x","repeat":26214115,"wireBytes":26214400,"wrapperBytes":26214648},"expected":{"HTTP":413,"documents":0,"error":"too_large","truncate":false},"id":"E12","title":"expansão do wrapper cruza cap sem arquivo grande"}
```

### E13

Cada `manifest` é o objeto do manifesto persistido. A ausência de
`readerFeatures`, o array vazio e o valor explícito `null` são casos distintos;
nenhum alias ou sentinela representa campo ausente.

<!-- prettier-ignore -->
```json
{"cases":[{"manifest":{},"read":"accept-empty"},{"manifest":{"readerFeatures":null},"read":"reject-before-recovery"},{"manifest":{"readerFeatures":[]},"read":"accept-empty"},{"manifest":{"readerFeatures":["authorized-content-envelope/1"]},"read":"accept"},{"manifest":{"readerFeatures":["delivery-receipts/1"]},"read":"accept"},{"manifest":{"readerFeatures":["authorized-content-envelope/1","delivery-receipts/1"]},"read":"accept"},{"manifest":{"readerFeatures":["delivery-receipts/1","authorized-content-envelope/1"]},"read":"accept"},{"manifest":{"readerFeatures":["authorized-content-envelope/1","authorized-content-envelope/1"]},"read":"reject-duplicate"},{"manifest":{"readerFeatures":["future/1"]},"read":"reject-before-recovery"}],"id":"E13","title":"readerFeatures fechado: ausência, [] e null distintos"}
```

### E14

<!-- prettier-ignore -->
```json
{"expected":{"duplicateEffects":0,"inboundCommits":1,"newAuthenticatedRetryRequired":true,"reuseHistoricalAuthContext":true,"verifyHash":"1092bf47727a90c37c49d01b19791d8b033afad957a7ed5ba530cd7687ae3300"},"features":["authorized-content-envelope/1"],"id":"E14","orphan":{"bytes":507,"envelopeScope":"provider-content-event-auth-envelope-separated-v1","messageKey":"[\"evolution\",\"synthetic-session\",\"m0265\"]","mime":"application/json","path":"inbound/02650000-0000-4000-8000-000000000001.json","sha256":"1092bf47727a90c37c49d01b19791d8b033afad957a7ed5ba530cd7687ae3300","stage":"published"},"title":"par órfão completo depois feature antes frame"}
```

### E15

<!-- prettier-ignore -->
```json
{"expected":{"effectsAllowed":false,"ordinaryBackupSecretfree":false,"ready":false,"reason":"legacy_content_credentials","resumeCanRelease":false,"rewrite":false},"id":"E15","legacyEvent":{"apikey":"SYNTHETIC_0265_TRANSPORT_A","data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"ajuda"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"title":"legado com credencial entra hold em todo startup"}
```

### E16

<!-- prettier-ignore -->
```json
{"expected":{"SPEC0264Implemented":false,"deliveryProjection":"compare-full-existing-values","receiptNamespace":"preserve-all-documents-and-sidecars","reobserve":false,"resend":false},"id":"E16","inboxProjection":{"authorizedContentEnvelope":{"bytes":507,"envelopeScope":"provider-content-event-auth-envelope-separated-v1","path":"inbound/02650000-0000-4000-8000-000000000001.json","sha256":"1092bf47727a90c37c49d01b19791d8b033afad957a7ed5ba530cd7687ae3300"}},"readerFeatures":["authorized-content-envelope/1","delivery-receipts/1"],"title":"backup recebe ambos readers e projeção nova sem remover delivery"}
```

### E17

<!-- prettier-ignore -->
```json
{"expected":{"addFeatureOnRead":false,"addScope":false,"readable":true,"rewrite":false},"id":"E17","legacyEvent":{"data":{"key":{"fromMe":false,"id":"m0265","remoteJid":"5511900000001@s.whatsapp.net"},"message":{"conversation":"ajuda"}},"event":"messages.upsert","instance":"synthetic-session","sender":"5511900000009@s.whatsapp.net"},"title":"legado seguro permanece sem scope novo"}
```

### E18

<!-- prettier-ignore -->
```json
{"descriptor":{"bytes":507,"envelopeScope":"provider-content-event-auth-envelope-separated-v1","messageKey":"[\"evolution\",\"synthetic-session\",\"m0265\"]","mime":"application/json","path":"inbound/02650000-0000-4000-8000-000000000001.json","sha256":"1092bf47727a90c37c49d01b19791d8b033afad957a7ed5ba530cd7687ae3300","stage":"published"},"expected":{"readOnly":"reject","recoverOrTruncate":false,"recreateSidecar":false,"writable":"reject"},"id":"E18","readerFeatures":["delivery-receipts/1"],"title":"scope sem feature é rejeição RO e RW"}
```

### Hashes físicos das seis fontes do handoff

- `delivery-receipts.ts` — 30918 bytes, SHA-256 `58cfadefdc1b7d3961cad846fee065d381f8f90280a1d221bc40430528a43c23`.
- `domain.ts` — 19677 bytes, SHA-256 `aa585bbdfcaa27dfcd79eb5609a5131f6f9a3d589cfe79f2ceddc61b5171302c`.
- `domain-v2.ts` — 5422 bytes, SHA-256 `de9d898b2af1eb93487372bae0f8d10bf914720f3e74ff6691b96145bce3d7c5`.
- `journal.ts` — 49131 bytes, SHA-256 `80443d14d6b15cbc3ec6f20d0f5cf0ecb0533f74e299e9b0bed831448fd4cdf1`.
- `media-store.ts` — 16037 bytes, SHA-256 `501061bb8e784d58fa5b9a8ab2a69b0a9266e27b2c07366d00482ebfd5b1f527`.
- `store.ts` — 94049 bytes, SHA-256 `50dbf0a7def648f5bcbe7b32368e01942faa0d00ddaa51241ffdb148d706d181`.

Manifesto R2 dos24inputs e exemplos: runtime próprio, arquivos `input-manifest.json` e `example-manifest.json`. Estes hashes vinculam os documentos de desenho; não são novos receipts de produto nem prova de execução.
