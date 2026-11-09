# SPEC 0264 — Publicação de backup e nova reverificação

Data: 23/10/2026. Task `PROD0624-U21-BACKUP-FINALIZATION-SPEC-001`, checkpoint83. Estado **PROPOSED / NOT_IMPLEMENTED / DOCUMENT_REVIEW_PENDING**. Autor: mesmo builder Erdos, agora designer; nenhuma revisão independente é atribuída ao autor. Uma passagem de desenho, seguida de freeze. Este documento não concede BUILD, aceite de U21, T3, piloto ou produção.

## 1. Autoridade, problema e decisão proposta

A [SPEC0179 §10](0179_shift_consumer_reliability.md), hash `988192fe48737b4571ed659f051e22f3a9283d5c433e7c6c078e1dd0f7be86c3`, está aprovada **inteira** para BUILD local sintético pelo [receipt humano](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/human-t3-approval.json), hash `00c49ece2fec0a260cfed658dec5ed64a20e2b797984d38e0330bb7fd2ad1914`. Seu cabeçalho histórico PROPOSED não revoga essa aprovação; ver [estado adjacente](0179_shift_consumer_reliability-approval-status.md). Não pedir nova aprovação desse mesmo hash. NO_MODEL clínico, D1–D4, retenção integral e ausência de efeitos reais continuam vigentes.

0179 manda sincronizar a cópia e seus metadados, verificar todos os hashes, depois emitir `backup_verified`. Tentativa falhada/incompleta é FAILED e não permite arquivamento. F01 é defeito em relação a esse contrato já aprovado: `finish()` serializa sucesso antes de terminar fsync/close/sync de diretório; o catch modifica apenas o retorno. [Review estático F01/F02](../04_audit/evidence/PROD0624-EXEC-20261023/u21/backup-static-review-r2/review.md) e [conferência do Lead R3](../04_audit/evidence/PROD0624-EXEC-20261023/u21/backup-compat-r3/lead-verification.json) distinguem o defeito de qualquer alegação de corrupção.

Evidência R3 preservada: **62 casos = 58PASS/4FAIL**, todos os56 anteriores passam, original49 prefix intacto. Nos quatro REDs: função retorna FAILED, `receipt.json` visível contém VERIFIED, restore retorna PASS, hashes da cópia são iguais aos originais. Três fases exercidas antes da operação física: receipt-file-sync, receipt-close, receipt-directory-sync; a quarta repete falha inicial e arma falha da gravação de evidência. Esse segundo hook **NOT_REACHED** porque R3 não tenta gravar tal evidência. Nenhuma nova execução nesta SPEC e nenhum FAIL reclassificado. Não inferir perda/corrupção de bytes de EIO de sync.

**Escolha proposta:** separar (a) candidato físico persistido sem declaração de ACK, (b) resultado observado da função publicadora e (c) uma operação NOVA de reverificação+restore, que reabre os bytes e produz sua própria evidência. Um `VERIFIED` legado persistido nunca atesta ACK original. Uma operação nova pode legitimamente PASS com bytes íntegros após tentativa FAILED; isso não transforma a tentativa original em sucesso.

| Item                                                                                                                                       | Natureza/autoridade                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Ordem de verificação e sync, FAILED em erro, diagnósticos honestos, D4, locks reais, inventário completo, hold do verificador              | Correção da implementação sob0179 já aprovada; não nova exigência de aprovar0179                                                |
| Protocolo de candidato em `receipt.json`, inventário3, evidência de falha, tipos de resultado/report2 e interpretação nova pelos consumers | **Delta genuíno T3 proposto** de formato persistido/contrato público, ainda sem aprovação; detalhado aqui para revisão concreta |
| F02 vida de descritores                                                                                                                    | Implementado localmente em R3 congelado; não reaberto nem certificado aqui                                                      |
| AP011 novo EVENT/rawScope/projeção                                                                                                         | Interface futura de Einstein; fora desta SPEC, sem adivinhar campos                                                             |
| Namespace arbitrário sameUID/WriterLock e hold persistente de startup                                                                      | UNPROVEN, interfaces separadas; este protocolo não resolve nem dispensa                                                         |

A exigência de eliminar o defeito não depende de nova autorização do objetivo0179. A solução versionada escolhida muda inputs públicos e admissão de consumidores; **essa extensão**, após Lead e crítico documental fresco, requer decisão T3 explícita e limitada ao delta0264 antes de implementá-la. Isto não afirma que toda correção concebível exija schema novo. Reescrever VERIFIED em FAILED ou acrescentar um marcador de sucesso não prova que o próprio sync/close/ACK daquele marcador terminou; tratar ausência de falha como sucesso repete o problema. Desabilitar permanentemente backup/restore também não satisfaz0179.

## 2. Baseline real e superfície de migração

Fonte R3 congelada: `backup.ts` SHA `330ecb89b7a03376e3f05d7c483e98ec6d5c3bcd915640f894dd491cab2f1bd0`, teste SHA `f3571506d907dff43a32709e8374669ec80c2d4b72a6513eb7c66084d88f53c6`. Snapshot estático dos callers, normas e evidências no runtime `product-backup-finalization-spec-runtime-r1/inputs/`; hashes exatos no apêndice. O snapshot não é um perfil atual inteiro qualificado. Store/domain/journal podem mudar na lane Einstein.

Atualmente `BACKUP_TOOL='cvg-shift-backup/2'`; `BackupOptions`, `createBackup(options):Promise<BackupResult>`, `restoreBackup({backupDir,targetDir}):Promise<RestoreReport>` e `copyVolume(fromDir,toDir)` são exports reais. `BackupResult={backupDir,receipt}`. Receipt em memória: schema1, kind `shift-assistant-backup-receipt`, event `backup_verified|backup_failed`, status `VERIFIED|FAILED`, IDs/tool/timestamps/totais, hashes opcionais, reasons e removal. A mesma estrutura é serializada em `receipt.json` antes do fim. O parser de restore admite **só** schema1 VERIFIED, tool1/2, ambos hashes obrigatórios, reasons vazio, `.strict()`.

Inventário atual schema1/V1 ou schema2/V2, `.strict()` em todos os objetos; V2 exige tool2 e lock exclusivo. Projeção é JSON canônico completo produzido por `ShiftStore(dir,{readOnly:true}).projection()`, não uma contagem. `RestoreReport` atual: schema1, kind `shift-assistant-restore-proof`, verdict PASS/FAIL, checks e backupId/projectionSha256/counts opcionais. `restoreBackup` sempre revalida conteúdo; atualmente o relatório não identifica a distinção entre resultado da publicação original e essa nova leitura.

Callers diretos reais encontrados no consumidor: `scripts/backup.mjs`, `scripts/restore-proof.mjs`, `src/__tests__/{backup-v2-compatibility,restore-alert-reliability,restore-sandbox-guards}.test.ts`. `restore-sandbox.ts` importa `copyVolume`, cuja interface não muda. Busca estática de símbolos no root publicado não encontrou outro caller; isso não prova ausência de consumidores externos de CLI/JSON. `docs/operations.md` descreve a saída e precisa migração de linguagem pelo seu dono, sem edição nesta task.

## 3. Identidades, caminhos, bytes e limites

Todas as definições seguintes são **TARGET PROPOSTO**, não implementações. Tool novo exatamente `cvg-shift-backup/3`; versões anteriores não ganham campos nem aceitam tool3 por wildcard. `backupId` conserva formato `shift-backup-YYYYMMDDTHHMMSS-xxxxxx` (hex minúsculo6); `attemptId` é UUIDv4 gerado uma vez por `createBackup`, inclusive em falha; cada `restoreBackup` gera outro UUIDv4 `operationId`, nunca reutiliza attemptId. `clock` continua apenas fonte de timestamps e não gera identidade. Duplicidade/EEXIST falha, não sobrescreve nem retoma a mesma tentativa. Retry de backup usa nova pasta e novo attemptId; retry de restore usa novo operationId e target novo/vazio.

Paths relativos são POSIX sem raiz, `.`/`..`, componentes vazios, barra invertida ou NUL; máximo512 caracteres como hoje. Receipts/reports não carregam caminho de paciente, segredo, stack ou URL. Pastas0700/arquivos0600; nenhum link ou special file, inclusive metadados e ancestrais. Raiz de backup própria, fora do source; proibida sobreposição source/backup/target por checks atuais. Escritas create-exclusive e cadeia de descritores do R3, sem nova primitiva de lock.

Layout novo exato: `outDir/backupId/{data/,inventory.json,projection.json,receipt.json,failure.json?}`. `receipt.json` passa a conter candidato2, **nunca receipt1 VERIFIED** do publicador novo. `failure.json` é opcional, único, imutável/create-exclusive; até falhas precoces podem deixar apenas essa evidência e diretórios parciais. Não há ack.json, marcador commitado, rename sobre arquivo, quarantine, delete, pruning ou upgrade in-place. Report de restore é retornado/impresso, não inserido no backup nem usado como autorização reutilizável. Se operador salvar stdout, seus bytes são evidência da observação salva, não novo input confiável de admissão.

`data/` tem exatamente todos os documentos inventariados: manifestos, segmentos e prefixos/tails físicos, UUID/seq, inbound/media/sidecars, V1 e backups de migração, recovery orig/tail/metadata, órfãos e review docs. Exceção única continua o lock operacional `data/writer.lock` próprio temporário; não é documento de aplicação nem entrada do inventário. Lock foreign/residual/corrupto é recusa, nunca removido/recuperado pelo backup. Diretórios vazios não contam como documentos. No formato novo, raiz permite somente os paths acima; qualquer outro arquivo/diretório, alias ou duplicidade é conflito e FAIL antes do target. No legado, admitir somente a raiz histórica `data/`, `inventory.json`, `projection.json`, `receipt.json`; nenhum novo sidecar é anexado a ela. Conteúdo retido dentro de `data/` permanece integral, sem allowlist de extensões.

SHA-256 hex minúsculo64 e `bytes` inteiro seguro não negativo referem-se aos **bytes completos do arquivo**, inclusive espaços/LF em inventory/receipt/failure. `projection.json` novo é UTF-8 do `canonicalJson` atual (keys ordenadas recursivamente, arrays preservados, sem LF); hash não pode ser só contagens. Metadados novos usam UTF-8 JSON pretty2+LF, sem BOM. Consumers rejeitam UTF-8 inválido, JSON truncado, chaves duplicadas em qualquer objeto, desconhecidas, null indevido, NaN/infinito, unsafe integer ou versão/kind/tool fora das uniões. Não normalizam antes de conferir hash. Inventário/projeção legados mantêm bytes antigos; validação por hash precede parse/replay. Não canonizar/regravar input.

Limites propostos novos: candidato até65.536 bytes e failure até16.384 bytes, sem truncamento. UUIDs36, timestamps UTC ISO `YYYY-MM-DDTHH:mm:ss.sssZ`, códigos/estágios pelas enumerações abaixo; textos livres não entram nas novas evidências. O inventário não ganha limite pequeno de diretórios/documentos; tamanhos/contadores/somas mantêm `Number.MAX_SAFE_INTEGER=9007199254740991`. Overflow ou impossibilidade de representar soma é FAIL `numeric_limit_exceeded`. Falta de memória/EMFILE/ENFILE é recurso, não journal_corrupt; a implementação deve prever leitura/hash por chunks e orçamento antes de alocar, sem alegar suporte ilimitado de memória/tempo. Não se aprova host limit novo nesta SPEC. Limites de JSON antigos não são retroativamente reduzidos por65KiB. FDs vivos devem depender dos ancestrais ativos, não de todos os irmãos visitados. A fixture256/nofile192/peak31 R3 é evidência local, não um teto de diretórios nem garantia de desempenho universal.

## 4. Schemas propostos exatos

Notação TypeScript de dados JSON, sem métodos. Todos os objetos são strict; uniões são fechadas. `Sha` é regex `^[0-9a-f]{64}$`; `U` é inteiro seguro≥0; `Time` e `Id` têm os formatos acima. Uma propriedade `?` pode faltar, nunca receber null salvo união explícita. JSON não pode conter undefined. Tipos atuais referidos por nome neste capítulo são exatamente os congelados em `backup.ts`, não versões móveis.

```ts
type MetaRef<P extends string> = { path: P; bytes: U; sha256: Sha }
type BackupAttemptV2 = {
  schemaVersion: 2
  kind: 'shift-assistant-backup-attempt'
  event: 'backup_candidate'
  status: 'REQUIRES_FRESH_REVERIFICATION'
  tool: 'cvg-shift-backup/3'
  backupId: string
  attemptId: Id
  createdAt: Time
  contentVerifiedAt: Time
  originalPublisherAcknowledgement: 'UNATTESTED'
  inventory: MetaRef<'inventory.json'>
  projection: MetaRef<'projection.json'>
  files: U
  bytes: U
  removal: 'none (D4: originals and copies are kept)'
}
type Stage =
  | 'preflight'
  | 'source-lock'
  | 'source-inspection'
  | 'data-copy'
  | 'inventory-write'
  | 'projection-write'
  | 'content-final-sync'
  | 'source-close'
  | 'attempt-open'
  | 'attempt-write'
  | 'attempt-file-sync'
  | 'attempt-close'
  | 'attempt-directory-sync'
  | 'output-close'
type Cause =
  | 'EIO'
  | 'ENOSPC'
  | 'EDQUOT'
  | 'EROFS'
  | 'EMFILE'
  | 'ENFILE'
  | 'EACCES'
  | 'EPERM'
  | 'EEXIST'
  | 'VERIFICATION_FAILED'
  | 'LOCK_FAILED'
  | 'OTHER_IO'
type FailureStage =
  | 'failure-open'
  | 'failure-write'
  | 'failure-file-sync'
  | 'failure-close'
  | 'failure-directory-sync'
type BackupFailureV1 = {
  schemaVersion: 1
  kind: 'shift-assistant-backup-publication-failure'
  tool: 'cvg-shift-backup/3'
  backupId: string
  attemptId: Id
  observedAt: Time
  candidateSha256: Sha | null
  publisherObservation: 'FAILED'
  stage: Stage
  cause: Cause
  originalPublisherAcknowledgement: 'UNATTESTED'
  removal: 'none (D4: originals and copies are kept)'
}
type FailureEvidenceObservation =
  | { state: 'NOT_NEEDED' }
  | { state: 'RECORDED_LOCALLY'; file: MetaRef<'failure.json'> }
  | { state: 'RECORDING_FAILED'; stage: FailureStage; cause: Cause }
  | { state: 'NOT_ATTEMPTED_NO_SAFE_ROOT' }
type PublicationObservation = {
  schemaVersion: 1
  kind: 'shift-assistant-backup-publication-observation'
  attemptId: Id
  origin: 'createBackup-return'
  localOutcome: 'COMPLETED' | 'FAILED'
  callerAcknowledgement: 'UNATTESTED'
  primaryFailure: { stage: Stage; cause: Cause } | null
  failureEvidence: FailureEvidenceObservation
}
type BackupResultV2 = {
  schemaVersion: 2
  kind: 'shift-assistant-backup-result'
  backupDir: string
  receipt: BackupReceipt
  publication: PublicationObservation
}
```

`BackupReceipt` mantém **todos** seus campos atuais do §2, schemaVersion1/kind/event/status/removal. É **somente resultado em memória/stdout**, tool3 no produtor novo, e não é gravado como receipt1 no backup. VERIFIED/reasons[] só é construído **depois** que cópia/inventário/projeção/candidato e diretórios foram sync/close sem erro, lock próprio foi liberado sem perda e cleanup necessário terminou. Não afirma que o chamador recebeu o objeto nem que houve entrega stdout. FAILED tem reasons≥1; campos hash opcionais só se foram calculados sobre bytes reais. Status/event e publicação têm refinements obrigatórios: VERIFIED⇔COMPLETED+primaryFailure null+NOT_NEEDED; FAILED⇔FAILED+primaryFailure real+um dos outros3 estados. `primaryFailure` preserva estágio/cause original no retorno mesmo quando a evidência não pode ser gravada. `attemptId` sempre igual ao candidato/evidência que existir. Receipt não ganha permissões de pruning.

`BackupInventoryV3`: exatamente os campos de `BackupInventory` congelado, **substituindo apenas** `schemaVersion` por literal3 e `tool` por literal `cvg-shift-backup/3`. `kind`, backupId, createdAt, sourceRealpathSha256, journal, media, writer, files e totals permanecem obrigatórios/strict. Journal é a união fechada **exata** `LegacyJournalInventory|V2JournalInventory` do R3: V1 `{format:'v1',uuid:null,seq:null,dependency:string não vazia,segments:SegmentSummary[]}`; V2 inclui uuid UUID, seq≥0, revision≥1, anchorSha256/lastSha256/manifestSha256, pendingTailBytes e segments≥1. `SegmentSummary` preserva file/bytes/sha256/committedBytes/committedSha256/lines/tailBytes/events e sealedPrefixBytes/sealedPrefixSha256 opcionais em par. FileKind continua exatamente journal_manifest/journal_segment/recovery/media/other. `writer.lock` do produtor3 é somente `exclusive_writer_lock`, inclusive fonteV1; operatorConfirmedStopped/stableDuringCopy true, stoppedUrl refused|waived_by_operator, openHandles none_visible|unavailable, unreadableProcesses U. `media={referenced:U,missing:[],orphans:string[]}`; paths de orphans válidos e pertencem a files. Totais/somas/kinds/ref hashes/prefixos são comparados com documentos físicos e replay, não só tipados.

Inventory3 admite V1 sem migrar nem reinterpretar V2 como V1. Inventory1/2+receipts1 continuam em parsers próprios bytecompatíveis, incluindo dependência descritiva V1 e a restrição atual schema2↔journalV2/tool2/lockexclusivo. Receipt2 exige inventory3/tool3. Versão antiga com tool3 ou receipt2 com inventory2 é conflito: FAIL; nenhum fallback para vazios/legado ou schema permissivo.

```ts
type ReverificationInput = {
  kind: 'ATTEMPT_V2' | 'LEGACY_VERIFIED_RECEIPT_V1'
  document: MetaRef<'receipt.json'>
  attemptId: Id | null
  originalPublisherAcknowledgement: 'UNATTESTED'
  publisherObservation: 'NOT_RECORDED' | 'FAILED_RECORDED'
  failureEvidence: MetaRef<'failure.json'> | null
}
type RestoreReportV2 = {
  schemaVersion: 2
  kind: 'shift-assistant-restore-proof'
  operation: 'FRESH_ARTIFACT_REVERIFICATION_AND_RESTORE'
  operationId: Id
  startedAt: Time
  completedAt: Time
  verdict: 'PASS' | 'FAIL'
  checks: RestoreCheck[]
  input?: ReverificationInput
  backupId?: string
  projectionSha256?: Sha
  counts?: Record<string, U>
  hold: {
    mode: 'READ_ONLY_VERIFIER'
    egress: 'DENIED'
    persistentStartupHold: 'UNPROVEN'
  }
}
```

Refinements: ATTEMPT_V2 requer attemptId UUID e bytes de candidato2 válidos; LEGACY requer attemptId null, publisherObservation NOT_RECORDED, failureEvidence null e receipt1 VERIFIED estrito tool1/2. FAILED_RECORDED requer failureEvidence válido e bound; sua existência é observação de FAILED registrada, sem autenticação externa ou prova da própria durabilidade. NOT_RECORDED requer failureEvidence null; não significa sucesso. `candidateSha256` da failure, se há candidato completo, deve ser seu hash exato, mesmo backupId/attemptId/tool. Candidato completo com failure.candidateSha256 null é conflito. Sem candidato válido não há admissão para restore, ainda que failure tenha hash. `input` só aparece depois de validado o discriminador/hash e suas ligações; FAIL anterior pode omiti-lo. PASS exige input+backupId+projectionSha256+counts e todos os checks realmente executados/pass; exceção/cleanup failure rebaixa o novo report para FAIL. `RestoreCheck` conserva `{name:string,pass:boolean,detail?:string}`; nenhum campo altera resultados de checks antigos.

## 5. Pipeline da publicação e falhas de finalização

1. Validar opções/overlap/symlinks antes de escrever em source. `BackupUsageError` e códigos out_inside_source/out_symlink continuam. Gerar IDs antes de tentar criar raiz própria exclusiva; `backupDir` no resultado identifica também o path pretendido se criação falhou. Erro ordinário de open/mkdir do output que hoje pode escapar como exceção passa a resultado FAILED/primaryFailure preflight, NOT_ATTEMPTED_NO_SAFE_ROOT, sem tentar reconstruir a raiz. Esse ajuste de consumer semantics integra o delta proposto, não um PASS retroativo. Somente uso inválido continua lançando BackupUsageError; crash/OOM fatal não promete retorno. Reservar descritor de raiz **e um guard de diagnóstico independente** para que falha no close do descritor principal ainda permita tentar failure.json pela raiz previamente ancorada. O guard não é lock novo nem pin de namespace imutável. Sem guard seguro, a única classificação permitida é NOT_ATTEMPTED_NO_SAFE_ROOT.
2. Adquirir o **mesmo** WriterLock, respeitar source V1/V2 parado, URL check/waiver subordinado ao lock, indícios de processos explicitamente limitados. Inventariar/replay readOnly sem repair/migration/reconcile, comparar todas as projeções e mídia antes/depois, copiar bytes para data create-exclusive; sincronizar arquivos e diretórios de baixo para cima. Release de irmãos conforme R3; não fechar ancestrais ativos. A parte clínica não executa modelo.
3. Escrever/sync/close inventory3 e projection. Comparar exatos bytes/hashes/totais/replay de source e cópia, sem transformar storageHealthy=false por readOnly em corrupção. Sincronizar conteúdo/raiz, terminar lock+close source. Falha gera FAILED; não criar candidato admitível se material incompleto. Um source-lock residual por falha do owner não é removido pelo builder.
4. Só depois de conteúdo completo, construir bytes de BackupAttemptV2 com `REQUIRES_FRESH_REVERIFICATION` e ACK UNATTESTED. Calcular hash pretendido **antes** do open/write para ligar failure mesmo em escrita parcial. Criar receipt.json O_EXCL|O_NOFOLLOW, write loop sem zero-write, fsync arquivo, close, fsync diretórios/parent da raiz e close dos descritores necessários. Guardar o primeiro erro com estágio/cause real; erro de cleanup adicional não apaga o primeiro. Nunca serializar VERIFIED em receipt.json novo.
5. Se tudo terminou, construir o resultado local VERIFIED, publication COMPLETED e callerAcknowledgement UNATTESTED. Fechar o guard de diagnóstico também antes de declarar sucesso. Falha desse último close usa output-close; sem guard restante seguro pode resultar NOT_ATTEMPTED_NO_SAFE_ROOT. Não se alega capacidade infalível de diagnóstico. Nenhum documento persistido neste fluxo afirma o retorno desse último close ou o recebimento pelo chamador.
6. Em qualquer falha com raiz segura, tentar **uma vez** criar failure.json, escrever/sync/close e sync do diretório. O documento só narra o primeiro erro já observado, nunca alega que sua própria gravação teve ACK. Registrar o hash dos bytes realmente pretendidos no resultado se a gravação completa e os passos locais terminarem. Se open/write/fsync/close/dirsync da evidência falhar, publication.failureEvidence=RECORDING_FAILED com esse segundo stage/cause; manter receipt FAILED e o primeiro erro. **Não** tentar um failure-of-failure.json, reescrever receipt, apagar parcial ou retry para verde. Depois de perda de identidade segura não se escreve em raiz de substituição.
7. Cleanup deve contabilizar FDs próprios e tratar erro de close de forma honesta: não repetir cegamente close após EIO em um número que pode já ter sido reutilizado; não afirmar zero survivors sem medição. Terminar a operação sem reconstruir source/backup/target. Mesmo failure parcial/ausente continua D4 e é preservada para observação humana.

Mapeamento novo mantém razões guard/replay atuais. EMFILE/ENFILE→resource_exhausted; EIO/ENOSPC/EDQUOT/EROFS→storage_io_error. Falha na publicação do candidato acrescenta `publication_not_acknowledged` e conserva `receipt_not_persisted` por compatibilidade de diagnóstico (significa conclusão não estabelecida, **não prova ausência do arquivo**). Falha na evidência acrescenta `failure_evidence_not_persisted`; nenhuma segura acrescenta `failure_evidence_unavailable`. Erro de close do source/output também é FAILED. Erros de validação não viram storage_io_error nem êxito. Códigos desconhecidos são OTHER_IO na nova evidência, sem persistir mensagem arbitrária; a reason concreta de validação permanece no resultado. Não prometer que qualquer retorno ou report de erro chegará ao chamador após crash/kill/output failure.

Não há transação atômica entre bytes visíveis, retorno de fsync, fim de close, resolução de Promise, write stdout e ACK do consumidor. O status único persistido do candidato é propositalmente conservador até em caso normal. Falha de sync pode deixar bytes íntegros/visíveis ou não; nenhuma das situações autoriza inventar ACK. Em crash sem retorno, observação é desconhecida, nunca COMPLETED por ausência de failure. `failure.json` pode estar legível mesmo que seu sync falhou; apenas registra que FAILED foi observado, não que o registro foi durável.

## 6. Nova operação de admissão, reverificação e restore

`restoreBackup` conserva exatamente os argumentos. **Cada chamada** é nova operação independente do estado em memória do publicador, do CLI exit antigo ou de report salvo. Não depende de um cache PASS. O significado de PASS é integridade física+lógica e cópia desta nova operação, sob hold do verificador; não ACK da tentativa antiga, liberação de startup, sandbox funcional, produção ou arquivamento.

Antes de criar/reservar/escrever target, deve:

1. Ancorar raiz/metadados sem symlink/special file, classificar univocamente receipt1 legado VERIFIED ou candidato2/tool3. Malformed/missing/unknown receipt é FAIL; receipt1 FAILED continua FAIL mesmo com bytes bons. Não reparar evidência falhada. Raiz e metadados têm exact set do §3; failure opcional ausente **não bloqueia bytes bons** de candidato2 porque não declara ACK. Failure presente inválida/truncada/binding divergente é FAIL, não ignorada.
2. Conferir tamanhos/hashes de inventory/projection e refinements de versões, backupId/tool/createdAt/totais; validar paths únicos/confinados e writer.lock excluído. Hash exato de receipt é guardado em input. Qualquer conflito/erro antes desse fim impede bootstrap de target. Preservar causa real e todos os originais, inclusive failure malformada.
3. Fazer exact set em data, hash/bytes de **cada** arquivo e manifestos/segments/prefix/UUID/seq/chain/pending tail. Sob mesmo WriterLock da cópia e `ShiftStore(data,{readOnly:true})`, obter projection/pendingTailBytes/close sem migrar/reparar/recriar; comparar o objeto completo canônico com projection.json, journal e media do inventário. Mídia ausente, manifest corrupto rehashed, orfãos não inventariados, segredo adicionado, ou projeção forjada com hashes coerentes continuam FAIL. Não há fallback de dados vazios.
4. Provar target novo ou existente vazio e real, pais reais, sem source/backup overlap, identidade consistente; reservar via WriterLock e reexaminar vazio. Source/backup docs não são modificados; somente próprio lock transitório normal. Copiar O_EXCL/NOFOLLOW por cadeia R3, verificar hashes+exact set antes/depois, sync arquivos/diretórios e verificar estabilidade da origem. Falhas após começo preservam target parcial; próximo restore exige outro target vazio, não cleanup automático.
5. Reabrir target somente leitura/operationalHold do verificador/egress negado; comparar projeção completa, vínculos, revisões/confirmação/substituição, tarefas/número/generation/due/status/contadores, pause, inbox stage/retry/budget, outbox receipts/uncertain, mídia e todos os bytes/tails. Fechar stores/locks/descritores e só então finalizar verdict. `effects inhibited under hold` deve vir de condições reais `readOnly && !storageHealthy && !effectsAllowed`, não de um bool fixo; readOnly storageHealthy false não é corrupção. Preservar hold histórico de migração sem alterá-lo.

Todos os checks atuais que expressam conteúdo/guards continuam. `receipt verified` permanece como nome histórico do gate estrutural, detail obrigatório `format and declared content only; publisher acknowledgement UNATTESTED`. Acrescentar no report somente após as respectivas verificações físicas efetivas os checks `fresh artifact re-verification after uncertain publication` e `original publisher acknowledgement not established`. Eles só passam se input binding+replay/cópia concluídos e campos de provenance verdadeiros; **acrescentar duas strings sem executar o pipeline não satisfaz F01**. Report mantém os checks negativos anteriores e não apaga primeiro erro por um sucesso posterior.

Legacy receipt1/tool1/2 VERIFIED é elegível **apenas** para nova reverificação completa; ACK fica UNATTESTED e attemptId null. Não inventar UUID histórico a partir de backupId e não inserir sidecars/ACK no legado. O parser legado permanece strict para seus campos/versões/garantias originais. Falta de receipt ou receipt1 FAILED não ganha admissão pela nova rota; evidência do produtor continua conservada e falhada. Candidato2 com failure válida pode PASS nessa nova operação se todos os checks de conteúdo passarem; input.publisherObservation=FAILED_RECORDED, sem mudar o FAILED original. Validar outra vez a cada chamada, inclusive depois de PASS anterior.

O report retornado não é um admission token para outro processo abrir um volume normal. Não fornece API de release hold. `persistentStartupHold:'UNPROVEN'` é limite explícito, não dispensa0179. O script de sandbox continua responsabilidade do owner de restore-sandbox; não rodar o assistente na origem nem no restaurado, não reenviar provider_accepted/uncertain. Full U21 exige interfaces persistentes/fidelidade/B2 e provas atuais separadas.

## 7. Callers, CLI e critérios explícitos de migração

| Superfície atual                                            | TARGET proposto e obrigação verificável                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BackupOptions e argumentos createBackup                     | Sem alteração de campo, flag ou waiver; clock opcional igual; retornos de erro de uso preservados                                                                                                                                                                                                                                                                                                                          |
| BackupResult export                                         | Passa a BackupResultV2 do §4, conserva backupDir/receipt e adiciona discriminador e publication obrigatórios; receipt1 retornado não é o documento candidato2                                                                                                                                                                                                                                                              |
| BackupReceipt export                                        | Mesmos campos/tipos; significado de VERIFIED local após conclusão, nunca ACK de recebimento. tool:string já permite3 no tipo, mas parsers persistidos antigos não são afrouxados                                                                                                                                                                                                                                           |
| restoreBackup({backupDir,targetDir}) / RestoreReport export | Mesma chamada; return passa ao ReportV2 exato, mantém verdict/checks/counts, distingue operação nova e provenance; consumidores strict de report1 precisam migrar                                                                                                                                                                                                                                                          |
| copyVolume / restore-sandbox.ts                             | Assinatura e resultado `{ok:boolean,detail?:string}` sem alteração, nenhum novo allow/release/ABI de domínio; cópia não é prova de ACK ou persistent hold                                                                                                                                                                                                                                                                  |
| backup.mjs                                                  | Mesmas flags e entrypoint; imprimir BackupResultV2 inteiro, não destructurar só2 campos. Exit0 somente resultado local COMPLETED/VERIFIED e write stdout terminado sem erro observado;1 para FAILED/output error;2 uso/tool indisponível. stderr best effort não é receipt durável. Consumidor ainda verifica exit+schema+publication; stdout completo sozinho não comprova exit0/ACK                                      |
| restore-proof.mjs restore                                   | Mesmas flags. Envelope stdout schemaVersion2, kind `shift-assistant-restore-and-sandbox`, verdict PASS/FAIL, restore ReportV2, sandbox report atual ou `{verdict:'NOT_RUN',reason:'restore failed'}`. Exit0 exige nova operação PASS **e** sandbox PASS e stdout sem erro observado;1 FAIL/output error;2 uso/tool indisponível. Não rotular PASS global de backup antigo. make-fixture conserva interface/shape/semântica |
| docs/operations.md                                          | Explicar candidate semACK, resultado local vs histórico, relatórios novos/legados, retenção D4, hold não persistente ainda não qualificado. Atualização futura pelo owner sob novo claim                                                                                                                                                                                                                                   |
| Consumidor externo de JSON                                  | Versão2 exige parser próprio; não reinterpretar receipt.json como receipt1 ou aceitar versão desconhecida; old consumers recusam candidato2 em vez de falso VERIFIED. Não prometer old tool2 restaurar backup3                                                                                                                                                                                                             |

Futuro BUILD deve incluir adaptador de CLI no mesmo corte vertical que produtor/restore; não publicar produtor3 isolado com CLI que omite publication, nem consumer novo só com checkname. Não alterar outro writer sem claim/handoff explícito. Nenhum desses arquivos recebe escrita nesta task.

Migração de testes é **prospectiva, após revisão/decisão**, mantendo número, nomes, entradas e predicados funcionais dos49/56/62. Original R1/R2/R3 e raw logs imutáveis. Critérios que permitem alteração de expectativa estrutural em cópias futuras, nunca em evidência antiga:

- `backup-v2-compatibility.test.ts:104/158`: novo produtor passa inventory2/1 para inventory3, mas deve continuar exigindo journalV2 UUID/seq não vazio e V1 real sem migração; acrescentar controles históricos tool1/2+inventory1/2 originais byteexatos. Retirar a exigência de journal/bytes/hold é proibido.
- Helpers de tamper (`:212` e testes tableados `:734`): hashes de inventory/projection agora ficam em receipt2.inventory/projection, bytes e totals também devem ser recalculados quando a intenção é alcançar replay/path checks. Guardar a mutação semântica original e exigir **o mesmo** FAIL antes do target, não aceitar um FAIL estrutural anterior como substituto. Manter todos os vetores unknown-field/version-conflict/UUID/seq/prefix/total, hash/symlink/extra/missing/projection/corrupt-manifest.
- `restore-alert-reliability.test.ts:268/408/480` helpers rehasham schema antigo. Migrar rehash para candidato2 somente nas novas fixtures. Negativas de traversal, symlink, mídia, exact set e projeção forjada mantêm causa alcançada, target inexistente e hashes originais. Manter também a rota de tamper dos artefatos legados reais, sem convertê-los a tool3.
- Asserções `receipt verified`, `inventory hash matches receipt`, `hashes match before writing`, `paths are relative and inside the set`, `no symlink or special file`, `target is new and empty`, `projection matches under hold` continuam seus predicados. Listas de checks só ganham gates novos sem remover guardas antigos. Nenhuma renomeação para ocultar causa não alcançada.
- Retorno receipt.status VERIFIED/event backup_verified em sucesso local e FAILED nas negativas continua. CLI test `:964` mantém flags, exit real, backupId, source hashes e JSON; acrescenta schema2/publication e distinção disco/retorno. `restore-sandbox-guards.test.ts` mantém todos os guardas e ausência de efeitos; setup real V2 da lane Einstein não é refeito nem stubado aqui.
- R2 sete e F02 dois preservam flags/ancoragem, refusals antes do primeiro byte, lifetime e resource_exhausted; não trocar pela simples existência de campos novos. Width256/nofile192 childonly e caps não são reduzidos.
- R3 quatro REDs não viram verdes só porque disco não tem status VERIFIED. Acrescentar expectativas **positivas** do candidato2/provenance/operationId novo, FAILED original, hashes iguais, stages físicos alcançados e duas rotas de evidência de falha. `failure-record-also-fails` exige agora secondFailureAttempt=true no write real pretendido de failure.json; sem isso o caso continua FAIL. Preservar unsafe=false e os predicados de originais/cópia. Não apagar asserts antigos; eventuais mudanças estruturais precisam diff/mapeamento revisado pelo Lead.

## 8. Aceitação futura discriminante e recursos

Nenhuma linha desta tabela foi executada nesta task. Primeira prova RED e falhas intermediárias R3 ficam intactas. Cada fixture futura precisa comando/argv/cwd/env-whitelist, fonte/deps PREPOST congeladas, syscall hook antes da operação real, stage efetivamente atingido, timing/exit bruto/hash, PID/PGID e ausência observada de survivors próprios. Hooks call-through fora da falha; real exports/replay, sem oracle copiado. Comparar retorno, arquivos físicos reabertos e downstream **em processo novo**; novo processo por caso dentro dos caps, não multiplicar tentativas para verde.

| ID  | Caso futuro                                                                                                                                                                | Evidência que distingue correção de rótulo/noop                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Normal V2 não vazio e V1 compat                                                                                                                                            | Função VERIFIED só depois dos sync/close; disco candidato2/UNATTESTED; restore2 novoId PASS/full hashes/projection; legacy1/2 reais também PASS novoId sem ACK inventado                                                                                                                                                |
| A02 | attempt-file-sync EIO antes do sync                                                                                                                                        | Return FAILED, candidato visível ou parcial sem VERIFIED, failure primária attempt-file-sync; reabertura bytes sem promessa de durabilidade; nova reverificação só PASS se conteúdo/evidências completas e válida, FAILED original retido                                                                               |
| A03 | attempt-close EIO antes do close                                                                                                                                           | Mesmo com bytes completos, FAILED; trace cleanup/FDs, nunca retry cego/ACK presumido; causa attempt-close. Nova reverificação pode PASS qualificada, não sucessão retroativa                                                                                                                                            |
| A04 | attempt-directory-sync EIO antes do sync                                                                                                                                   | Conteúdo pode estar bom; failure registra estágio correto; restore novo report distinguido, originais iguais, nenhum VERIFIED persistido                                                                                                                                                                                |
| A05 | A02 seguido failure-write EIO                                                                                                                                              | Hook de segunda falha **realmente alcançado** antes do write; RECORDING_FAILED/failure-write/EIO, primeiro erro intacto, parcial preservada. Reopen com failure truncada falha antes target; se nenhum byte/documento foi criado, ausência não prova sucesso e bytes candidatos podem ser reavaliados independentemente |
| A06 | A02 seguido failure-file-sync EIO                                                                                                                                          | Write completo da failure executado, segundo hook de sync alcançado; retorno continua FAILED com RECORDING_FAILED; documento legível não prova ACK, nova operação só o trata como FAILED_RECORDED se estrito/bound                                                                                                      |
| A07 | Falha do registro em failure-open/close/directory-sync e raiz insegura                                                                                                     | Cada stage observado, sem terceiro registro/overwrite; NOT_ATTEMPTED só se nenhum guard seguro. Reabrir após terminar processo; destino nenhum ou parcial retido, D4 intacto                                                                                                                                            |
| A08 | Falhas no data-copy/inventory/projection/content-final-sync/source-close/output-close                                                                                      | Nunca VERIFIED local, primária correta, evidência só best effort; candidato inexistente/incompleto rejeitado, no bootstrap; source integral, sem silent repair                                                                                                                                                          |
| A09 | Crash/interrupção em finalização                                                                                                                                           | Processo termina sem retorno; bytes reabertos completos podem PASS como nova operação com UNATTESTED, truncados/missing/malformed falham. Sem afirmar fsync-return/ACK/crash-durability; kill só no grupo próprio e nenhuma execução ofensiva antiga                                                                    |
| A10 | Failure/candidate malformados/unknown fields/duplicate JSON keys/oversize/binding ou versões conflitantes                                                                  | FAIL antes de qualquer byte/lock/bootstrap no target; originais inclusive evidence inválida intactos; sem fallback. Limites atingidos/excedidos testados separadamente                                                                                                                                                  |
| A11 | Legacy VERIFIED1/tool1+inventory1 e VERIFIED1/tool2+inventory2; FAILED1/missing receipt                                                                                    | Boas passam **nova** reverificação sem ACK; FAILED/missing continuam FAIL; originals byteiguais e nenhum sidecar novo                                                                                                                                                                                                   |
| A12 | Source active/residual/corrupt lock, URL waived; media missing, manifest corrupt rehashed, symlink/escape, extra/missing/duplicate entry, divergent hashes, targetexisting | Mesmos FAILs normativos anteriores com causa real atingida, target não iniciado para erro de input; sem tocar foreign lock nem originais; para falha de copy target parcial preservado                                                                                                                                  |
| A13 | Projeção rica e hold                                                                                                                                                       | Comparação completa campos do §6, retries/uncertain/noresend/gerações/due/pause/tails/órfãos; readOnly real/egress negado. Sandbox funcional só após handoff do owner; persistent startup hold continua interface separada                                                                                              |
| A14 | Repetir nova reverificação após modificação de bytes entre operações                                                                                                       | operationIds distintos, segundo FAIL sem cache, sem mutação do primeiro receipt/report, sem confiar em stdout salvo ou hash sem leitura                                                                                                                                                                                 |
| A15 | CLI boa/falha/output EPIPE/uso                                                                                                                                             | Exit0/1/2 reais + JSON versão2 integral e provenance; output error não reescreve disco nem inventa ACK; restore CLI exige sandbox também, prints truncados não admitidos como sucesso                                                                                                                                   |
| A16 | F02 largura e EMFILE/ENFILE regulares                                                                                                                                      | Conservar width256, childnofile192, hashesroundtrip; descriptores vivos em função de profundidade, resource_exhausted preciso, sem tinycountlimit/raise caps                                                                                                                                                            |

Quatro casos F01 originais permanecem nomeados A02–A05; A06 adiciona failure-sync de fato, não se confunde com o hook nunca alcançado do R3. Asserts concretas `secondFailureAttempt`, `failureSyncAttempted`, errno/stage e contagens de chamada são obrigatórias, além dos estados. Failure evidence legível após seu sync falhar não é descartada nem chamada de corrompida por isso. Reabertura deve testar tanto existência legível quanto parcial/ausente real, sem fingir que EIO sempre implica uma delas.

Recursos do futuro corte local: Node22.23.2 no path já fixado, mesmos três pacotes públicos e vendor reais frozen, sem imports do main mutável, deps readonly, volumes/HOME/TMP/cache/logs próprios. Child10s, test15s, outer90s **inalterados**. Um controller90s por comando focal, sem repetir para verde; dividir novas classes em comandos explícitos dentro desses limites, preservando também o comando com62 casos. Linux loopback só se fake stoppedURL realmente necessário; default testes usam waiver+lock real sem rede. Sem install/native/provider/model/PG/host globals. A01 usa história não vazia, A09 subprocessos próprios com encerramento bounded; se algum novo caso exigir recurso além do cap, registrar medição/falha e pedir proposta finita ao Lead, não aumentar automaticamente. Não há pedido concreto de novos recursos nesta SPEC.

## 9. Handoff e limites da rodada de desenho

Foram somente lidos código/callers/evidências existentes e produzidos documentos/exemplos sintéticos por biblioteca padrão, sem importar módulos do produto, Node, CLI, tests ou probes. Nenhum replay James bloqueado nem nova revisão ofensiva. Não há crítico fresco nesta entrega; autor não substitui I1. O Lead recebe artefato congelado para leitura e **crítico documental fresco** antes de qualquer questão humana real. Depois: decisão apenas sobre o delta T3 necessário, task/claims prospectivos e corte vertical produtor+consumer+CLI+regressões; não há concessão de BUILD aqui.

AP011 aguardará handoff exato de Einstein sobre documentos/event namespace/projection e contexto público atual antes de compatibilidade. Fonte F02 R3, startup persistent hold, WriterLock unlink namespacegap e arbitrarysameUID permanecem congelados/UNPROVEN; nenhum waiver. U11/U12/U20/segunda máquina/fullprofile/certificação/revisão fresca/T2/destino/humano e cartões pais continuam abertos. Não há produção, release, commit, push ou aceite. Lead faz append/readback Gbrain/ledgers; este designer só entrega payload local.

## 10. Exemplos completos e proveniência estática

Os exemplos abaixo são **dados de desenho**, não recibos de execução de tool3. Usam bytes sintéticos já retidos no R3, copiados somente para o runtime novo, e novos metadados calculados estaticamente. Identidades/timestamps/valores são concretos; nenhuma operação produto3 foi executada. Cópia+hash desses inputs não é replay/validação semântica independente. Os reports de exemplo mostram o resultado **exigido futuro**, não PASS observado nesta task. Checklistexplicitado nos exemplos deve ser expandido pela implementação com todos os checks antigos; não constitui permissão de omitir um gate real.

Os paths de apresentação `examples/normal/`, `failed-sync/` e `legacy-v1/` contêm também resultados de desenho, portanto são **bundles documentais**, não raízes admissíveis de backup. As árvores físicas de exemplo com exact set estão separadas em `examples/artifacts/{normal,failed-sync,legacy-v1,failure-of-failure}/`: somente data/inventory/projection/receipt/failure opcional, resultados/report sempre fora. `example-artifact-manifest.json` liga esses bytes aos blocos abaixo. Nenhuma dessas árvores foi submetida ao produto.

### 10.1 Material V2 não vazio: inventário3 completo

`normal/inventory.json` — 2492 bytes; SHA-256 `bee3ba04dcf26951b650b3cc874517c296658cd2e3e6a6fa6dba6e0aaa8cbd48`.

```json
{
  "schemaVersion": 3,
  "kind": "shift-assistant-backup-inventory",
  "tool": "cvg-shift-backup/3",
  "backupId": "shift-backup-20261023T190000-026401",
  "createdAt": "2026-10-23T19:00:00.000Z",
  "sourceRealpathSha256": "b84a1f29091143af6ed25528c67d0391980fbbab45970de3ef37e5f2837a76ae",
  "journal": {
    "format": "v2",
    "uuid": "8c4bbc8b-25af-42ad-be88-39f0815b02c8",
    "seq": 2,
    "revision": 1,
    "anchorSha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "lastSha256": "5de10dd2ef8c2620013fd3cb542b78fd10e4056d647edf6880caed31a7abea68",
    "manifestSha256": "158f80d33c6e961ee6060a75ce3cd931f0fda10e992ef23ab00fd3b9215bd5ce",
    "pendingTailBytes": 0,
    "segments": [
      {
        "file": "journal/segment-f20566ae-da9b-4ff7-be14-aaa799a8592d.jsonl",
        "bytes": 934,
        "sha256": "76fc0e0bdfe8ec06920effb524457b9a455a333a41ef4a14de18b4012f25d802",
        "committedBytes": 934,
        "committedSha256": "76fc0e0bdfe8ec06920effb524457b9a455a333a41ef4a14de18b4012f25d802",
        "lines": 2,
        "tailBytes": 0,
        "events": {
          "inbound_recorded": 1,
          "operation_paused": 1
        },
        "sealedPrefixBytes": 0,
        "sealedPrefixSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ]
  },
  "media": {
    "referenced": 0,
    "missing": [],
    "orphans": []
  },
  "writer": {
    "operatorConfirmedStopped": true,
    "stoppedUrl": "waived_by_operator",
    "openHandles": "none_visible",
    "unreadableProcesses": 715,
    "stableDuringCopy": true,
    "lock": "exclusive_writer_lock"
  },
  "files": [
    {
      "path": "journal/manifest-r1.json",
      "kind": "journal_manifest",
      "bytes": 370,
      "sha256": "158f80d33c6e961ee6060a75ce3cd931f0fda10e992ef23ab00fd3b9215bd5ce"
    },
    {
      "path": "journal/manifest.json",
      "kind": "journal_manifest",
      "bytes": 370,
      "sha256": "158f80d33c6e961ee6060a75ce3cd931f0fda10e992ef23ab00fd3b9215bd5ce"
    },
    {
      "path": "journal/segment-f20566ae-da9b-4ff7-be14-aaa799a8592d.jsonl",
      "kind": "journal_segment",
      "bytes": 934,
      "sha256": "76fc0e0bdfe8ec06920effb524457b9a455a333a41ef4a14de18b4012f25d802"
    },
    {
      "path": "journal.json",
      "kind": "journal_manifest",
      "bytes": 100,
      "sha256": "66c66359ab2aa6c52378546d062a3cbe7f4096ba7402d33488d38c81369891fa"
    }
  ],
  "totals": {
    "files": 4,
    "bytes": 1774
  }
}
```

Projeção completa (bytes canônicos **sem LF** no arquivo; a apresentação do bloco não altera o hash `292930bba910a48dfb6c3e332c29b286621e3df57059373bfb112fdc27d0a4db`, 386 bytes):

<!-- Byte-exact canonical projection artifact: preserve this JSON block only. -->

<!-- prettier-ignore -->
```json
{"inbox":[{"attempt":0,"mediaRefSha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","ref":"a2db8094cb349821","revision":1,"state":"received","textSha256":"352ad97c74be6868a9c562a62c8dc4ff16ed03a7cc3070c85f7a5b67aa6fbe79"}],"messages":[],"nextTaskNumber":1,"notes":[],"operationalHold":false,"paused":true,"tasks":[],"vertical":{"notes":[],"outbox":[],"tasks":[]}}
```

### 10.2 Publicação normal: candidato persistido sem ACK

`normal/receipt.json` — 824 bytes; SHA-256 `45d020c71d489d1ba096628c806ac3513129cea97a4b4a70aa225d11218e68ca`.

```json
{
  "schemaVersion": 2,
  "kind": "shift-assistant-backup-attempt",
  "event": "backup_candidate",
  "status": "REQUIRES_FRESH_REVERIFICATION",
  "tool": "cvg-shift-backup/3",
  "backupId": "shift-backup-20261023T190000-026401",
  "attemptId": "02640000-0000-4000-8000-000000000001",
  "createdAt": "2026-10-23T19:00:00.000Z",
  "contentVerifiedAt": "2026-10-23T19:00:01.000Z",
  "originalPublisherAcknowledgement": "UNATTESTED",
  "inventory": {
    "path": "inventory.json",
    "bytes": 2492,
    "sha256": "bee3ba04dcf26951b650b3cc874517c296658cd2e3e6a6fa6dba6e0aaa8cbd48"
  },
  "projection": {
    "path": "projection.json",
    "bytes": 386,
    "sha256": "292930bba910a48dfb6c3e332c29b286621e3df57059373bfb112fdc27d0a4db"
  },
  "files": 4,
  "bytes": 1774,
  "removal": "none (D4: originals and copies are kept)"
}
```

### 10.3 Resultado local normal após finalização

`normal/returned-result.json` — 1132 bytes; SHA-256 `93fe82b11aaad4549b0808c169ffe0fbfecf32476ddfdeed3c1c0395d98dae9a`.

```json
{
  "schemaVersion": 2,
  "kind": "shift-assistant-backup-result",
  "backupDir": "/synthetic-backups/shift-backup-20261023T190000-026401",
  "receipt": {
    "schemaVersion": 1,
    "kind": "shift-assistant-backup-receipt",
    "event": "backup_verified",
    "status": "VERIFIED",
    "backupId": "shift-backup-20261023T190000-026401",
    "tool": "cvg-shift-backup/3",
    "createdAt": "2026-10-23T19:00:00.000Z",
    "completedAt": "2026-10-23T19:00:01.000Z",
    "files": 4,
    "bytes": 1774,
    "inventorySha256": "bee3ba04dcf26951b650b3cc874517c296658cd2e3e6a6fa6dba6e0aaa8cbd48",
    "projectionSha256": "292930bba910a48dfb6c3e332c29b286621e3df57059373bfb112fdc27d0a4db",
    "reasons": [],
    "removal": "none (D4: originals and copies are kept)"
  },
  "publication": {
    "schemaVersion": 1,
    "kind": "shift-assistant-backup-publication-observation",
    "attemptId": "02640000-0000-4000-8000-000000000001",
    "origin": "createBackup-return",
    "localOutcome": "COMPLETED",
    "callerAcknowledgement": "UNATTESTED",
    "primaryFailure": null,
    "failureEvidence": {
      "state": "NOT_NEEDED"
    }
  }
}
```

### 10.4 Tentativa com EIO de sync: candidato ainda conservador

`failed-sync/receipt.json` — 824 bytes; SHA-256 `fa47eb6c165cbe5d4c8c5083f0461379f6b49e2f5ff957c127b339ac2cea9f8e`.

```json
{
  "schemaVersion": 2,
  "kind": "shift-assistant-backup-attempt",
  "event": "backup_candidate",
  "status": "REQUIRES_FRESH_REVERIFICATION",
  "tool": "cvg-shift-backup/3",
  "backupId": "shift-backup-20261023T190100-026402",
  "attemptId": "02640000-0000-4000-8000-000000000002",
  "createdAt": "2026-10-23T19:01:00.000Z",
  "contentVerifiedAt": "2026-10-23T19:01:01.000Z",
  "originalPublisherAcknowledgement": "UNATTESTED",
  "inventory": {
    "path": "inventory.json",
    "bytes": 2492,
    "sha256": "88f4196ee5944f907fae8db93ffcf1299881c101cee5e26976ad05d8c8088a95"
  },
  "projection": {
    "path": "projection.json",
    "bytes": 386,
    "sha256": "292930bba910a48dfb6c3e332c29b286621e3df57059373bfb112fdc27d0a4db"
  },
  "files": 4,
  "bytes": 1774,
  "removal": "none (D4: originals and copies are kept)"
}
```

### 10.5 Evidência primária: não declara ACK da própria gravação

`failed-sync/failure.json` — 549 bytes; SHA-256 `2293bc279a8fd569eba3582cdab737375d537c73f3fd683990be075b3a1b103b`.

```json
{
  "schemaVersion": 1,
  "kind": "shift-assistant-backup-publication-failure",
  "tool": "cvg-shift-backup/3",
  "backupId": "shift-backup-20261023T190100-026402",
  "attemptId": "02640000-0000-4000-8000-000000000002",
  "observedAt": "2026-10-23T19:01:02.000Z",
  "candidateSha256": "fa47eb6c165cbe5d4c8c5083f0461379f6b49e2f5ff957c127b339ac2cea9f8e",
  "publisherObservation": "FAILED",
  "stage": "attempt-file-sync",
  "cause": "EIO",
  "originalPublisherAcknowledgement": "UNATTESTED",
  "removal": "none (D4: originals and copies are kept)"
}
```

### 10.6 Resultado FAILED original, mesmo com todos os hashes bons

`failed-sync/returned-result.json` — 1454 bytes; SHA-256 `3277c6b001533ed06d9bf8a42722cb87d7f654a84222ee6a112a70a487c34ac5`.

```json
{
  "schemaVersion": 2,
  "kind": "shift-assistant-backup-result",
  "backupDir": "/synthetic-backups/shift-backup-20261023T190100-026402",
  "receipt": {
    "schemaVersion": 1,
    "kind": "shift-assistant-backup-receipt",
    "event": "backup_failed",
    "status": "FAILED",
    "backupId": "shift-backup-20261023T190100-026402",
    "tool": "cvg-shift-backup/3",
    "createdAt": "2026-10-23T19:01:00.000Z",
    "completedAt": "2026-10-23T19:01:03.000Z",
    "files": 4,
    "bytes": 1774,
    "inventorySha256": "88f4196ee5944f907fae8db93ffcf1299881c101cee5e26976ad05d8c8088a95",
    "projectionSha256": "292930bba910a48dfb6c3e332c29b286621e3df57059373bfb112fdc27d0a4db",
    "reasons": [
      "storage_io_error",
      "publication_not_acknowledged",
      "receipt_not_persisted"
    ],
    "removal": "none (D4: originals and copies are kept)"
  },
  "publication": {
    "schemaVersion": 1,
    "kind": "shift-assistant-backup-publication-observation",
    "attemptId": "02640000-0000-4000-8000-000000000002",
    "origin": "createBackup-return",
    "localOutcome": "FAILED",
    "callerAcknowledgement": "UNATTESTED",
    "primaryFailure": {
      "stage": "attempt-file-sync",
      "cause": "EIO"
    },
    "failureEvidence": {
      "state": "RECORDED_LOCALLY",
      "file": {
        "path": "failure.json",
        "bytes": 549,
        "sha256": "2293bc279a8fd569eba3582cdab737375d537c73f3fd683990be075b3a1b103b"
      }
    }
  }
}
```

### 10.7 Nova operação posterior, PASS próprio e FAILED original preservado

`later-reverification/returned-report.json` — 3176 bytes; SHA-256 `3c7fd6e230b1ae241cead61d2d094a2d580ccc4600eb33663ed5e2e6c6be24e4`.

```json
{
  "schemaVersion": 2,
  "kind": "shift-assistant-restore-proof",
  "operation": "FRESH_ARTIFACT_REVERIFICATION_AND_RESTORE",
  "operationId": "02640000-0000-4000-8000-000000000101",
  "startedAt": "2026-10-23T19:10:00.000Z",
  "completedAt": "2026-10-23T19:10:02.000Z",
  "verdict": "PASS",
  "checks": [
    {
      "name": "receipt verified",
      "pass": true,
      "detail": "format and declared content only; publisher acknowledgement UNATTESTED"
    },
    {
      "name": "inventory hash matches receipt",
      "pass": true
    },
    {
      "name": "inventory metadata consistent",
      "pass": true
    },
    {
      "name": "projection hash matches receipt",
      "pass": true
    },
    {
      "name": "paths are relative and inside the set",
      "pass": true
    },
    {
      "name": "no symlink or special file",
      "pass": true
    },
    {
      "name": "set matches the inventory exactly",
      "pass": true
    },
    {
      "name": "hashes match before writing",
      "pass": true
    },
    {
      "name": "backup projection matches before writing",
      "pass": true
    },
    {
      "name": "journal identity and prefixes match inventory",
      "pass": true
    },
    {
      "name": "media inventory matches",
      "pass": true
    },
    {
      "name": "target is new and empty",
      "pass": true
    },
    {
      "name": "target exclusively reserved before copy",
      "pass": true
    },
    {
      "name": "copied hashes match",
      "pass": true
    },
    {
      "name": "backup unchanged during restore",
      "pass": true
    },
    {
      "name": "restored set matches exactly",
      "pass": true
    },
    {
      "name": "projection matches under hold",
      "pass": true
    },
    {
      "name": "journal identity and prefixes restored",
      "pass": true
    },
    {
      "name": "effects inhibited under hold",
      "pass": true
    },
    {
      "name": "referenced media present",
      "pass": true
    },
    {
      "name": "operation resources closed",
      "pass": true
    },
    {
      "name": "fresh artifact re-verification after uncertain publication",
      "pass": true
    },
    {
      "name": "original publisher acknowledgement not established",
      "pass": true
    }
  ],
  "input": {
    "kind": "ATTEMPT_V2",
    "document": {
      "path": "receipt.json",
      "bytes": 824,
      "sha256": "fa47eb6c165cbe5d4c8c5083f0461379f6b49e2f5ff957c127b339ac2cea9f8e"
    },
    "attemptId": "02640000-0000-4000-8000-000000000002",
    "originalPublisherAcknowledgement": "UNATTESTED",
    "publisherObservation": "FAILED_RECORDED",
    "failureEvidence": {
      "path": "failure.json",
      "bytes": 549,
      "sha256": "2293bc279a8fd569eba3582cdab737375d537c73f3fd683990be075b3a1b103b"
    }
  },
  "backupId": "shift-backup-20261023T190100-026402",
  "projectionSha256": "292930bba910a48dfb6c3e332c29b286621e3df57059373bfb112fdc27d0a4db",
  "counts": {
    "files": 4,
    "messages": 1,
    "notes": 0,
    "tasks": 0,
    "pendingTailBytes": 0
  },
  "hold": {
    "mode": "READ_ONLY_VERIFIER",
    "egress": "DENIED",
    "persistentStartupHold": "UNPROVEN"
  }
}
```

O report10.7 está fora da pasta de backup e não é token de admissão. Os bytes inventory/projection/data são novamente lidos; o candidato continua com status REQUIRES_FRESH_REVERIFICATION e a evidência10.5 continua FAILED. Não ocorreu mudança de status da operação10.6.

### 10.8 Segunda falha realmente exigida no futuro (resultado de exemplo)

`failure-of-failure/returned-result.json` — 1384 bytes; SHA-256 `a7beef941768e73f70aeb21f80aa33860a64acda11bac5d5c39cae496886d342`.

```json
{
  "schemaVersion": 2,
  "kind": "shift-assistant-backup-result",
  "backupDir": "/synthetic-backups/shift-backup-20261023T190100-026402",
  "receipt": {
    "schemaVersion": 1,
    "kind": "shift-assistant-backup-receipt",
    "event": "backup_failed",
    "status": "FAILED",
    "backupId": "shift-backup-20261023T190100-026402",
    "tool": "cvg-shift-backup/3",
    "createdAt": "2026-10-23T19:01:00.000Z",
    "completedAt": "2026-10-23T19:01:03.000Z",
    "files": 4,
    "bytes": 1774,
    "inventorySha256": "88f4196ee5944f907fae8db93ffcf1299881c101cee5e26976ad05d8c8088a95",
    "projectionSha256": "292930bba910a48dfb6c3e332c29b286621e3df57059373bfb112fdc27d0a4db",
    "reasons": [
      "storage_io_error",
      "publication_not_acknowledged",
      "receipt_not_persisted",
      "failure_evidence_not_persisted"
    ],
    "removal": "none (D4: originals and copies are kept)"
  },
  "publication": {
    "schemaVersion": 1,
    "kind": "shift-assistant-backup-publication-observation",
    "attemptId": "02640000-0000-4000-8000-000000000002",
    "origin": "createBackup-return",
    "localOutcome": "FAILED",
    "callerAcknowledgement": "UNATTESTED",
    "primaryFailure": {
      "stage": "attempt-file-sync",
      "cause": "EIO"
    },
    "failureEvidence": {
      "state": "RECORDING_FAILED",
      "stage": "failure-write",
      "cause": "EIO"
    }
  }
}
```

Exemplo10.8 fixa uma situação concreta: open de failure.json chegou a criar arquivo de0 bytes e write lançou EIO antes do primeiro byte. O artefato vazio é preservado e a próxima reverificação deve FAIL ao parsear failure.json, antes de criar target. Não se presume que toda falha de write tenha esse resultado físico. Na variante failure-file-sync, os bytes10.5 podem estar completos/legíveis apesar de sync falho; o resultado local deve continuar RECORDING_FAILED/failure-file-sync/EIO e a nova operação reportar FAILED_RECORDED se esses bytes forem válidos. Estes são requisitos futuros, não observações executadas.

### 10.9 Legado real V1 retido, sem ACK histórico inventado

Estes bytes são de artefato sintético schema1/tool2 com journalV1 já preservado em R3, copiados byteexatos no runtime novo (sem rodar produto); não são convertidos a3. Isto não é um exemplo tool1; a prova tool1 permanece exigência futura A11. Receipt completo:

```json
{
  "schemaVersion": 1,
  "kind": "shift-assistant-backup-receipt",
  "event": "backup_verified",
  "status": "VERIFIED",
  "backupId": "shift-backup-20261023T184824-d099e2",
  "tool": "cvg-shift-backup/2",
  "createdAt": "2026-10-23T18:48:24.596Z",
  "completedAt": "2026-10-23T18:48:24.744Z",
  "files": 1,
  "bytes": 76,
  "inventorySha256": "3f68fec94f24402f8e6b2f5e08b8363d66fcb3990f8c7f93959dd49e5592bc19",
  "projectionSha256": "a242a64be2707a18dd0c6ae568aa29c9e7cdb83ba39996abceaea3655fae22e9",
  "reasons": [],
  "removal": "none (D4: originals and copies are kept)"
}
```

### 10.10 Report futuro completo da nova leitura do legado

`legacy-v1/returned-report.json` — 3019 bytes; SHA-256 `181257b2fefbbda7ed2bf37ab80c70728556e56cad3b09bbd5a2d6aa8691a47e`.

```json
{
  "schemaVersion": 2,
  "kind": "shift-assistant-restore-proof",
  "operation": "FRESH_ARTIFACT_REVERIFICATION_AND_RESTORE",
  "operationId": "02640000-0000-4000-8000-000000000102",
  "startedAt": "2026-10-23T19:11:00.000Z",
  "completedAt": "2026-10-23T19:11:02.000Z",
  "verdict": "PASS",
  "checks": [
    {
      "name": "receipt verified",
      "pass": true,
      "detail": "format and declared content only; publisher acknowledgement UNATTESTED"
    },
    {
      "name": "inventory hash matches receipt",
      "pass": true
    },
    {
      "name": "inventory metadata consistent",
      "pass": true
    },
    {
      "name": "projection hash matches receipt",
      "pass": true
    },
    {
      "name": "paths are relative and inside the set",
      "pass": true
    },
    {
      "name": "no symlink or special file",
      "pass": true
    },
    {
      "name": "set matches the inventory exactly",
      "pass": true
    },
    {
      "name": "hashes match before writing",
      "pass": true
    },
    {
      "name": "backup projection matches before writing",
      "pass": true
    },
    {
      "name": "journal identity and prefixes match inventory",
      "pass": true
    },
    {
      "name": "media inventory matches",
      "pass": true
    },
    {
      "name": "target is new and empty",
      "pass": true
    },
    {
      "name": "target exclusively reserved before copy",
      "pass": true
    },
    {
      "name": "copied hashes match",
      "pass": true
    },
    {
      "name": "backup unchanged during restore",
      "pass": true
    },
    {
      "name": "restored set matches exactly",
      "pass": true
    },
    {
      "name": "projection matches under hold",
      "pass": true
    },
    {
      "name": "journal identity and prefixes restored",
      "pass": true
    },
    {
      "name": "effects inhibited under hold",
      "pass": true
    },
    {
      "name": "referenced media present",
      "pass": true
    },
    {
      "name": "operation resources closed",
      "pass": true
    },
    {
      "name": "fresh artifact re-verification after uncertain publication",
      "pass": true
    },
    {
      "name": "original publisher acknowledgement not established",
      "pass": true
    }
  ],
  "input": {
    "kind": "LEGACY_VERIFIED_RECEIPT_V1",
    "document": {
      "path": "receipt.json",
      "bytes": 578,
      "sha256": "b08b4b1e97c9124169ae1785882a50c5768ae4085e64b3220729caafc3537d8f"
    },
    "attemptId": null,
    "originalPublisherAcknowledgement": "UNATTESTED",
    "publisherObservation": "NOT_RECORDED",
    "failureEvidence": null
  },
  "backupId": "shift-backup-20261023T184824-d099e2",
  "projectionSha256": "a242a64be2707a18dd0c6ae568aa29c9e7cdb83ba39996abceaea3655fae22e9",
  "counts": {
    "files": 1,
    "messages": 0,
    "notes": 0,
    "tasks": 0,
    "pendingTailBytes": 0
  },
  "hold": {
    "mode": "READ_ONLY_VERIFIER",
    "egress": "DENIED",
    "persistentStartupHold": "UNPROVEN"
  }
}
```

### 10.11 Hashes das fontes e callers realmente lidos

Paths de produto relativos a `candidate/products/shift-assistant/`. Cópias estáticas capturadas antes do desenho; não atestam wholeprofile atual.

| Input                                             | Bytes | SHA-256                                                            |
| ------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| `src/backup.ts`                                   | 53845 | `330ecb89b7a03376e3f05d7c483e98ec6d5c3bcd915640f894dd491cab2f1bd0` |
| `src/__tests__/backup-v2-compatibility.test.ts`   | 54150 | `f3571506d907dff43a32709e8374669ec80c2d4b72a6513eb7c66084d88f53c6` |
| `scripts/backup.mjs`                              |  2440 | `c96d0210732fbd908284edbe0c6f097e5f7afa72f5be711dbde3d37ecbd5e7ce` |
| `scripts/restore-proof.mjs`                       |  4382 | `a99705e168fecbf48df87567d5224cbe47d7d13af35acd5e7ab95f744f8d6807` |
| `docs/operations.md`                              |  9416 | `13f71f212b8aa66d11afd1a90e0343fa6920cb112f303133aa9f17fb2e63f3a3` |
| `src/__tests__/restore-alert-reliability.test.ts` | 46263 | `5ecc9160b11eed33a29153885ff3fff440524de5dfb653ad480e38c258f5cb9f` |
| `src/__tests__/restore-sandbox-guards.test.ts`    | 10416 | `97cc411ecff0c24619a489580b31b6ee1b40d6e4695d4769f8d4d48629dddba9` |
| `src/restore-sandbox.ts`                          | 21825 | `ae4cdbfe5e7d9f65b40db650811b61f808ce39baf8abbe902cd69e456423e750` |
| `src/store.ts`                                    | 76081 | `408e500749481fda1cb0bb51c134ff4d91db69e367d22661edc67e386715f4bf` |
| `src/domain.ts`                                   | 18819 | `a9baf7774f2a389df6fa8dc346b6a5627b9f5d54e0a8ba2cc715485dd2f0acd8` |
| `src/journal.ts`                                  | 47569 | `55b4bef8dfb587439d9cf3ad3eb2ed22a67707df9b913e4f76e3a8f689695f8f` |
| `package.json`                                    |  1267 | `2eb1417c06bbfc6f5fe3ecaf1a8759218053d2d65b92ebfc2e854a933087d05e` |

O inventário completo dos33inputs, snapshots dos claims/normas/reviews e hashes dos exemplos estão no runtime de desenho. Leituras Gbrain são registradas, sem append remoto pelo designer. O original candidato/teste e todos os artefatos antigos permanecem readonly para esta task.

No checkpoint estático posterior houve drift em `domain.ts` e `journal.ts` da lane Einstein, na coordenação central e na representação textual da task. Esta última teve apenas formatação do array forbidden, com JSON semanticamente igual; não houve nova permissão. O desenho referencia os hashes capturados acima, não absorve a nova interface AP011 por inferência. `backup.ts` e seu teste R3 permaneceram exatamente nos hashes congelados. Reconciliação e valores PRE/POST constam de `source-post.json` no runtime; não há aceite do perfil compartilhado em movimento.
