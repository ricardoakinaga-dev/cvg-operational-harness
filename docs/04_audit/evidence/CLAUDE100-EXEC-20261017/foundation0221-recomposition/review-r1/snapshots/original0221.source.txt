# SPEC0221 — persistência pública de sessões e ownership PostgreSQL

- Estado: `PROPOSED_FOR_TECHNICAL_REVIEW`, revisão R2; trilha T3; BUILD não autorizado.
- Tarefa: P100-020/SESSION-PERSISTENCE-FOUNDATION, dependência de P100-015. Preparação T1 sob a [carteira integral](../03_build/0378_backlog_paridade_integral.md); nenhum cartão pai concluído.
- Autoridade: [constituição D-12](../07_agents/AGENTS.md), [coordenação](../08_runtime/agent_coordination.md) e [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md). A aprovação0217 não autoriza esta API/schema. A [0220](0220_pare100_durable_kernel_boundary_qualification.md) permanece um gate separado.
- Insumo: [75 bindings originais](../04_audit/evidence/PARE100-EXEC-20261014/matrix/session-durable-r3/leaf-bindings.json) e [18 procedimentos SD01–SD18](../04_audit/evidence/PARE100-EXEC-20261014/matrix/session-durable-r3/procedures.json), todos `PROPOSED_NOT_RUN`/`NOT_VERIFIED`. Preservar 71STATIC, quatroUNKNOWN, duas superfícies pendentes e denominador44132.

## 1. Problema e resultado exigido

CURRENT: `SessionEventStore` oferece `openSession/append/read`; open é idempotente, sequência começa em1 e leitura usa `afterSequence` exclusivo. O backend PostgreSQL0028 serializa cada append com row lock, valida digest/fingerprint e protege fatos contra alteração, mas não conhece handles, ownership duradouro entre transações, cabeçalho/corte herdado, flush público ou revisão. O lease de execução0217 protege outra fronteira: não equivale a ownership de sessão.

PROPOSED: uma API pública tenant-bound de create/open/read/append/flush/close/stat/list, sobre as mesmas tabelas v1. Um handle escritor possui uma conexão física e exclusividade de mutação entre processos; leitores continuam disponíveis. O SDK existente pode consumir um adapter ligado a esse handle, sem segundo log ou dual-write. Um processo sintético deve criar, executar um turno pelo SDK público, flush, morrer sem close, e outro processo deve reabrir e ler exatamente os mesmos fatos. Concorrência, writers antigos, ambiguidades de COMMIT e cancelamento fazem parte da aceitação.

Esta fundação não é paridade integral de P100-020: faltam vocabulário completo, fork/merge/resume de execução, lookup/search/export/projeções e import/export lossless da referência. P100-015 também exige os backends declarados por perfil. Nenhum desses critérios é dispensado. A referência pinada768fb1f3 usa formato4/seq0 e Cordis; CVG mantém formato1/sequence1. A transposição de offsets não constitui compatibilidade de eventos, metadados de autoridade ou importação de formato.

## 2. Alternativas e limites de responsabilidade

| Candidato                                                                       | Consequência                                                                                              | Decisão proposta          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| Store atual, mutex de processo                                                  | Dois processos admitem writers; flush/disposal inexistentes                                               | Insuficiente              |
| Lease com TTL em tabela                                                         | Exige renovação, relógio e fencing em todos os caminhos legados; não necessário para ownership de conexão | Rejeitado nesta fronteira |
| Transação aberta por toda a vida do handle                                      | Snapshot antigo/row lock longo; pool e manutenção prejudicados                                            | Rejeitado                 |
| Novo log independente ou espelho JSONL                                          | Duas autoridades e reconciliação sem requisito                                                            | Rejeitado                 |
| Advisory lock de sessão, conexão dedicada e guards transacionais nas tabelas v1 | Uma conexão por writer; transações curtas; impede writer antigo que não conhece handles                   | Selecionado para revisão  |

PostgreSQL16 documenta locks de sessão até unlock/fim da sessão, inclusive após rollback; locks transacionais terminam com a transação. Os dois níveis conflitam entre sessões e são reentrantes na mesma sessão. O mecanismo proposto abaixo depende dessas propriedades e ainda exige prova nativa. [Documentação de locking](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS).

Custos: uma conexão física por writer; leitores usam o pool. Sem limite de produção presumido: composição deve declarar `maxOpenWriters`, timeout de aquisição e pool total, reservando conexões para leitura/saúde. Atingir capacidade retorna erro sem claim parcial; não expulsar outro writer. Fixture futura: dois writers de sessões diferentes, pelo menos dois leitores e um slot de administração. Não criar broker/cache/Cordis no núcleo.

## 3. Contrato público proposto

Tipos abaixo são desenho inerte, não código já publicado. `SessionEvent`, `SessionEventAppend`, `SessionEventStore` e `SessionJson` continuam os tipos CVG v1 existentes. Os novos exports terão entrada pública documentada e fixture consumidor sem deep import.

```ts
type SessionAccess = 'read' | 'write'
type SessionPersistenceRevision = string & {
  readonly __sessionRevision: unique symbol
}
interface SessionHeaderV1 {
  readonly version: 1
  readonly id: string
  readonly createdAt: number
  readonly isSeeded: boolean
  readonly cwd?: string
  readonly parentSession?: string
  readonly origin?: 'subagent'
  readonly delegationDepth?: number
  readonly agentPreset?: string
}
interface SessionPersistenceOptions {
  readonly signal?: AbortSignal
}
interface SessionCreateOptions extends SessionPersistenceOptions {
  readonly inheritedEventCount?: number
}
interface SessionPersistenceSnapshot {
  readonly header: SessionHeaderV1
  readonly revision: SessionPersistenceRevision
  readonly eventCount?: number
  readonly sizeBytes?: number
}
interface SessionHandle extends AsyncDisposable {
  readonly id: string
  readonly header: SessionHeaderV1
  readonly inheritedEventCount: number
  readonly access: SessionAccess
  read(
    offset?: number,
    length?: number,
    options?: SessionPersistenceOptions
  ): Promise<{
    readonly eventState: 'detached'
    readonly events: readonly SessionEvent[]
  }>
  append(
    events: readonly SessionEvent[],
    options?: SessionPersistenceOptions
  ): Promise<void>
  flush(options?: SessionPersistenceOptions): Promise<void>
  close(): Promise<void>
}
interface SessionPersistence {
  readonly identity: symbol
  create(
    header: SessionHeaderV1,
    options?: SessionCreateOptions
  ): Promise<SessionHandle>
  open(
    id: string,
    access: SessionAccess,
    options?: SessionPersistenceOptions
  ): Promise<SessionHandle>
  flush(): Promise<void>
  stat(
    id: string,
    options?: SessionPersistenceOptions
  ): Promise<SessionPersistenceSnapshot | undefined>
  list(
    options?: SessionPersistenceOptions
  ): Promise<readonly SessionPersistenceSnapshot[]>
}
```

`identity` nasce uma vez por instância, permanece igual em views/proxies da composição e muda ao substituir serviço. Um contexto CVG confiável publica a mesma instância; não simular herança Cordis ou afirmar ABI idêntica. A factory PostgreSQL retorna serviço e owner de lifecycle interno; desligar o owner drena/fecha todos os handles, inclusive leitores. `SessionHandle[Symbol.asyncDispose]` delega à mesma promise de close, não a um no-op.

Entradas propostas em `@cvg/persistence`, sem deep import ou helper genérico por duck typing:

```ts
declare function createPostgresSessionPersistence(
  pool: PostgresPhysicalSessionPool,
  options: {
    readonly tenantId: string
    readonly schemaName: string
    readonly maxOpenWriters: number
  }
): Promise<{
  readonly service: SessionPersistence
  readonly owner: SessionPersistenceOwner
}>
declare function sessionEventStoreForHandle(
  handle: SessionHandle
): SessionEventStore
interface SessionPersistenceOwner {
  shutdown(): Promise<void>
  reconcileAttempt(
    ticket: SessionRecoveryTicket,
    options?: {
      readonly reestablishDurability?: boolean
    }
  ): Promise<SessionAttemptObservation>
}
```

`PostgresPhysicalSessionPool` é o novo port de leases físicos da seção6, com connect/acquisition deadline, query parametrizada, identidade da sessão emitida pelo adapter confiável, onLost e destroy/release uma vez. Publicar seus tipos na entrada da factory; o adapter real deve demonstrar que duas aquisições simultâneas não compartilham backend PID/sessão. `SessionRecoveryTicket` e `SessionAttemptObservation` seguem a seção8, sem SQL/credencial no contrato. Nenhum desses ports pode ser satisfeito por um reconnect transparente não qualificado.

Tenant vem exclusivamente da composição autenticada; não é aceito de header/options para mudar escopo. ID segue os limites v1 existentes. Metadata extra de header lossless JSON é preservada no snapshot e armazenamento, sem virar autorização. Campos reconhecidos são validados: createdAt/depth/cut inteiros seguros não negativos; cwd absoluto quando presente; strings de identidade/preset não vazias; version1 obrigatório. `isSeeded:true` exige cut explícito, inclusive0; false só aceita ausente/0. Cut pode exceder o corpo inicialmente vazio e nunca é inferido do corpo/pai. Não inserir evento artificial de header/cut. Parent/origin/depth/preset não concedem permissão de retomar, delegar ou executar ferramentas.

`create` rejeita duplicata, retorna writer e só resolve após materialização/COMMIT durável. `open` nunca cria; read não reclama ownership, write rejeita owner ativo. `stat` ausente é undefined; `list` retorna uma entrada por sessão visível, sem ordem prometida. Nenhum dos dois lê o corpo ou toma ownership. eventCount é next_sequence−1; sizeBytes fica ausente, sem confundir bytes físicos e quantidade.

## 4. Snapshot de entrada, vocabulário e leitura

No ingresso de create/append, capturar os valores uma única vez antes do primeiro await, depois validar e persistir somente essa captura. Preservar o getter enumerável controlado A/B de SD07: uma leitura do original, capturarA; não executar validação e cópia em duas travessias. Rejeitar ciclos, protótipos exóticos, chaves symbol/não enumeráveis, arrays esparsos, undefined/function/bigint, números não finitos e −0 no novo materializador lossless. Getter lançado falha sem IO; executar getter/Proxy não é sandbox de código hostil. Captura iterativa limitada por profundidade64, 20mil nós e64KiB de header; manter o limite v1 de1MiB por evento. Batch total máximo8MiB; ultrapassar falha de validação antes de IO, sem truncar/chunk-commit silencioso. Esses limites CVG são explícitos; não alegar domínio irrestrito equivalente à referência.

Header é persistido como JSON textual UTF-8, sem conversão de extensões para JSONB; escapes como U+0000 devem sobreviver sem coerção. Revalidar no read/open. Eventos permanecem no JSONB v1 existente; representações não suportadas por esse caminho são divergência a medir, nunca descartadas pelo comparador. IDs/fingerprints/digests, tipos e schema v1 continuam validados pelos helpers reais. Helpers novos serão exports reais de materialização/contiguidade/header/recusa de versão, compartilhados pelo backend e fixture pública; não copiar implementação da referência.

Append recebe eventos completos e ordem do chamador: sequence1 para primeiro evento e continuação exata do cursor, envelope tenant/session obrigatório, fingerprint atual. Não ordenar, renumerar, apagar ou sobrescrever fatos. Batch inteiro numa transação; sucesso implica aceitação/visibilidade e, no backend PG proposto, durabilidade mais forte. Append vazio é no-op válido em writer ativo. Readonly/lost/closed não ganham exceção por batch vazio.

Read default offset0/length restante; offset/length inteiros seguros não negativos; at/past-end retorna array vazio. Offset0 aponta para sequence1, offsetK para sequenceK+1, mantendo sequence persistido. Não calcular offset+length de modo a estourar inteiro seguro. Um read usa snapshot fresco consistente no primário, valida header e prefixo v1 completo em páginas internas de256 antes de devolver a fatia; não omitir corrupção fora da fatia. Array externo e valores detached pertencem ao chamador. Não manter snapshot SQL entre chamadas nem ler replica atrasada.

Toda operação admitida no mesmo handle tem ordem de chamada na fila; a captura ocorre na admissão e a execução checa sinal de novo antes de IO. Leitores distintos podem correr em paralelo. Após append/flush resolvido, reads/stat/list iniciados depois na mesma instância veem no mínimo esse head; read concorrente pode ver prefixo anterior válido. Guardar high-water mark por sessão/handle e recusar regressão observada como corrupção, sem fabricar eventos. Restore/PITR exige parar todas as instâncias e criar novas identidades; não faz parte de retomada transparente.

O formato4 da referência, tipos desconhecidos ignorable, helpers específicos daquele vocabulário e localização física JSONL continuam prova futura obrigatória G05/G08/G13. `validateStoredEvents` CVG não pode alegar que schema v1 sabe esses eventos. Versão desconhecida é unsupported, envelope v1 inválido é corruption; não fazer upgrade automático nem reutilizar `invalid_session_event` para esconder essa distinção na nova API.

## 5. Modelo persistido e privilégio

Expandir somente session_streams no schema dedicado: `writer_lock_id` positivo int4, unique, identity `NO CYCLE`; `header_json` text nullable na expansão; `inherited_event_count` bigint nullable pareado ao header. Bytes/ordem/sequence/event IDs/digests dos registros v1 permanecem intactos. Número de migration futuro candidato0030, a reservar novamente no BUILD;0028/0029 não são editados. Nenhuma migration ou DDL é executada nesta preparação.

Writer lock key é o par de int4 `(oid(session_streams)::bigint−2147483648, writer_lock_id)`, sempre da relação streams do schema confiável, nunca OID de events ou hash de tenant/session. ID único por relação impede colisão entre tenants; OID distingue schemas no mesmo banco. Reserva desse namespace de dois ints deve ser registrada na composição; nenhuma outra capacidade pode ocupá-lo. O espaço de bigint usado pelo runner de migration é separado do espaço de dois ints. [Funções advisory PG16](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

Não retornar lock key/role/SQL em erro público. Identity pode consumir números em INSERT ON CONFLICT/rollback; monitorar sequência e falhar fechado ao esgotar2147483647 tentativas, sem CYCLE/reuso. ID administrativo não é ID de negócio. Reseed/drop/recreate/restore não são operações serving; exigem quiescence e requalificação, sem manter handles vivos.

Manter FORCE RLS e tenant SET LOCAL em toda transação. Roles serving são non-owner, sem superuser/BYPASSRLS/DDL/TRUNCATE/DELETE e sem alterar session_replication_role/desativar triggers; sem SECURITY DEFINER ou grants PUBLIC novos. Privilégios mínimos: SELECT/INSERT nos registros, SELECT/INSERT streams e UPDATE apenas next_sequence, USAGE na sequência quando necessário ao caminho escolhido, EXECUTE somente nas funções necessárias. Backfill de metadata é credencial separada de migration; runtime não pode fazê-lo. Testar os grants reais, não assumir a role de testes elevada.

Preflight antes de servir valida migration checksum, OID/relação, RLS, constraints/triggers habilitados, papel/grants e parâmetros de durabilidade. Ausência/incompatibilidade recusa construção; não automigrar nem fallback para memória. A permissão de set_config do tenant não torna SQL arbitrário seguro: pool e credenciais são de composição confiável; nenhuma API aceita SQL ou escolha de tenant pelo cliente.

## 6. Ownership e coexistência de writers

Conexão writer é uma sessão PostgreSQL física reservada até close. Novo port interno explícito de connection lease expõe query, notificação de término/erro e destroy/release uma vez; proibidos proxy que reconecta ou transaction pooling/PgBouncer em modo transaction. Factory qualifica a sessão/primário e não reempresta essa conexão. Timeout de aquisição/statement/lock é5s na fixture; timeout não cria owner alternativo.

Create: adquirir conexão, transação tenant-bound e synchronous_commit on; inserir stream com header/cut, rejeitando duplicata; obter a chave retornada e tomar exatamente um session try-lock antes do COMMIT; só publicar handle após COMMIT. Falha/abort/COMMIT ambíguo destrói conexão e resolve recuperação pelo ID original, nunca retry com novo ID. Session lock sobrevive rollback; cleanup explícito/destroy é obrigatório também no create falho.

Open writer: ler chave/metadata existente em transação curta; ausente retorna not-found, header ausente migration-required; executar try-lock parametrizado numa chamada separada (sem efeito colateral dentro de SELECT com LIMIT); se false, already-owned. Revalidar identidade/head/header após claim e antes de publicar. Leitor usa pool e metadata detached, sem advisory lock. Writer não deixa uma transação idle aberta.

Guards no banco são parte obrigatória da migration: antes de INSERT em events e UPDATE de streams, tomar **transaction try-lock** da mesma chave. Na conexão owner é reentrante; outra conexão falha imediatamente. Na ausência de writer, o guard serializa a escrita antiga até COMMIT. Bloquear DELETE/TRUNCATE de streams e mutação de lock key/identity/header/cut; permitir adoção NULL→metadata apenas pela autoridade de migration na janela parada. Inserts novos do caminho legado recebem header honesto de criação atual no banco, unseeded/cut0; nunca preencher header histórico com NOW nem ON CONFLICT atualizar metadata existente.

Interleaving obrigatório: writer antigo já segura row lock; novo handle toma advisory session-lock e espera row; trigger antigo tenta advisory sem espera, falha, faz rollback e libera row. Não usar advisory bloqueante no trigger: produziria ciclo row/advisory. Reader simples não espera owner. Replay legado do mesmo eventId/digest já persistido pode retornar fato anterior sem mutação; é leitura idempotente, não segundo writer.

Guard INSERT valida vínculo/cursor e sequence igual a next_sequence. Cada evento novo é INSERT seguido de avanço unitário de cursor, ambos na mesma transação do batch, compatível com o store antigo. Guard UPDATE só admite cursor final igual a MAX(sequence)+1 (ou1 vazio), sem salto/regressão; flush pode atribuir o mesmo valor. Constraint trigger diferido ao COMMIT em events/streams também valida cursor/head final: INSERT direto sem avanço não pode deixar estado incoerente. Preflight valida prefixo histórico completo; fatos imutáveis+PK preservam contiguidade depois, sem exigir COUNT integral por append. SQL caller não pode desligar/deferir para além do COMMIT essa validação.

Uma conexão encerrada perde o lock no servidor; notificação, erro de conexão ou resultado ambíguo torna o handle terminal LOST. Nunca reconectar/reclamar automaticamente ou emprestar outra sessão para o mesmo handle. Append/flush subsequentes retornam ownership-lost; read permanece permitido pelo pool enquanto não houver close, com os mesmos guards de monotonicidade. Durante partição outro writer só abre quando o servidor realmente libertar o lock; disponibilidade não supera exclusividade.

Esse fence é de fatos persistidos, não de efeitos externos de um host antigo. Cutover exige parar dispatch/tools legados e reconciliar execução0217; P100-011 e demais gates de retirada permanecem. Nenhum teste de trigger prova que um provider antigo parou de executar.

## 7. Durabilidade, revisão e encerramento

Preflight exige fsync/full_page_writes on e primário; cada transação de escrita usa synchronous_commit on. Essa opção condiciona o ACK ao processamento do WAL; com off pode haver ACK anterior à persistência. [Configuração WAL PG16](https://www.postgresql.org/docs/16/runtime-config-wal.html). Não prometer tolerância a perda de disco, failover assíncrono ou falha de infraestrutura não qualificada.

Flush do writer enfileira barreira após operações admitidas, faz UPDATE de next_sequence para o próprio valor sob ownership e COMMIT síncrono. O UPDATE deve realmente gerar escrita/WAL mesmo sem mudança lógica: um COMMIT somente leitura não serve como barreira para append legado que usou commit assíncrono. Provar essa condição no PG16 real, inclusive sem append e com metadata recém-criada. Se a prova falhar, o desenho precisa revisão; não rotular SELECT como durável. Append próprio também é síncrono, mas flush continua método público observável.

Revision opaca combina nonce da instância, tenant/session, digest do header validado e next_sequence; não expor parsing/ordem como contrato. Igualdade só comparável na mesma instância/sessão. Append não vazio muda head/token, ownership/flush sem mudança lógica não mudam. Não usar token como permissão, resume cursor ou substituto de read. Events/header imutáveis e migração concluída são premissas; alteração administrativa exige parar instâncias. stat/list retornam metadata em snapshot fresco único, sem consultar corpo.

Close marca CLOSING sincronicamente antes do primeiro await, rejeita novas operações e memoiza sua promise; drena fila admitida, tenta flush e libera ownership/conexão exatamente uma vez. É incancelável; asyncDispose é a mesma sequência inclusive chamado sozinho em handle fresco. Falha de flush não é sucesso de close: preservar a rejeição nas chamadas repetidas, destruir conexão quando estado não é confiável e nunca devolver sessão ainda locked ao pool. Read close só libera estado local. LOST close libera recursos, reporta a incerteza pendente; todos os métodos posteriores a close chamado rejeitam closed, prevalecendo sobre read-only/lost.

Owner de serviço tem estados ACTIVE→CLOSING→CLOSED; shutdown marca CLOSING sincronicamente e memoiza a promise, inclusive falha. Nenhum serviço/adapter/handle admite nova operação depois dessa marca; rejeitar SessionPersistenceClosedError, salvo close/shutdown idempotentes. Cada operação admitida possui ticket de lifecycle registrado **antes de qualquer await**, inclusive create/open ainda sem lease/handle, stat/list/global flush/reconcile e trabalho do adapter. Aquisição registra lease imediatamente ao recebê-lo, inclusive resposta tardia a timeout. O adapter de pool deve manter responsabilidade por leases tardios até destruí-los; o prazo do chamador não os desregistra.

Handle cujo close já foi chamado mantém precedência de SessionHandleClosedError. Drain/barreira interna de close/shutdown usa a capability de teardown dos tickets já possuídos, sem readmitir operação pública de flush em serviço CLOSING; não aceitar novo append por essa exceção.

Shutdown fecha os handles já publicados e aguarda allSettled de todos os tickets/leases admitidos; nenhum handle pode ser publicado depois de CLOSING. Aquisição pendente que termina antes dessa marca publica/registre atomicamente ou, se a marca já ocorreu, fecha/drena/destroi seu recurso **antes** de encerrar o ticket. Open tardio rejeita serviço fechado; create tardio rejeita SessionAcquisitionClosedError com `creationOutcome:'not-created'|'committed'|'unknown'` e ticket de recuperação quando necessário, sem entregar writer vivo. COMMIT confirmado é reportado como committed, não aborto limpo; desconhecido permanece unknown. Metadata reads já admitidos podem completar durante shutdown, sempre antes de seu join.

Shutdown só resolve se todos os recursos locais foram recolhidos e nenhuma sessão/ownership própria ficou sem término confirmado. Cleanup/outcome desconhecido retorna AggregateError com operação/sessionId/ticket, sem sucesso fabricado ou apagar a obrigação. O prazo finito da fixture pode produzir rejeição pendente; não autoriza matar recursos alheios nem afirmar que destroy do socket já encerrou a transação no servidor. Repetir shutdown observa a mesma promise/erro; recuperação explícita usa outro owner ACTIVE e a mesma composição física qualificada, sem reabrir o owner fechado.

Flush global captura writers ativos **e tickets de barreira** sincronicamente no início, antes do primeiro await. Usa allSettled; cada capturado é tentado, falha não abandona os demais, erro agregado nomeia cada sessionId falho. Read handles ficam intocados. Writer que entrou em close após captura conta pelo close durável, e sua falha deve integrar o AggregateError. Writer criado depois da captura não é incluído. Não há transação atômica entre sessões.

Abort já sinalizado na admissão ou antes do início de IO rejeita AbortError sem claim/mutação/consulta. Depois que IO começa não há promessa de rollback por abort: aguardar resultado/cleanup conhecido ou erro de commit-unknown, jamais devolver abort limpo quando pode ter cometido. Close e global flush não recebem sinal. Não interromper espera de COMMIT destruindo a prova de resultado.

## 8. Erros e ponte para o SDK existente

Nova API exporta classes distintas, com `sessionId`, safe message e `cause` quando aplicável: SessionPersistenceNotFoundError, SessionAlreadyExistsError, SessionAlreadyOwnedError, SessionReadOnlyError, SessionOwnershipLostError, SessionHandleClosedError, SessionPersistenceCorruptionError, SessionFormatUnsupportedError. Unsupported inclui direção newer/older apenas quando versão numérica válida permite; location de PG é identidade lógica do backend, sem inventar path de arquivo. SessionMigrationRequiredError, SessionStorageUnavailableError e SessionCommitUnknownError são categorias adicionais CVG; não colapsar incerteza em sucesso/retry.

Commit-unknown contém ticket autêntico de recuperação capturado antes de enviar COMMIT; nunca recomputar digest do objeto original/getter. Registro privado imutável do ticket: kind create/append/flush, tenant/schema/pool identity da composição, sessão/endereço físico original e lock key já adquirida, attemptId, header digest/cut para create, head anterior e sequência ordenada de eventId/inputDigest/fingerprint/sequence para append, head alvo para flush. Dados diagnósticos públicos limitam-se a kind/sessionId/attemptId/IDs/digests; lock key/corpos/SQL/credenciais ficam privados. Ticket não concede execução, tenant, ownership permanente ou permissão de repetir efeitos.

`SessionRecoveryTicket` é um objeto opaco autenticado por registry privado do módulo da factory, sem construtor público, aceito apenas por owner ACTIVE do mesmo pool/schema/tenant qualificado. Pode atravessar duas factories dessa composição no mesmo processo; clone/objeto forjado ou de outro backend/tenant é recusado antes de IO. Não é recibo serializável durável. Depois da perda do processo inteiro, a classificação da tentativa continua UNKNOWN sem evidência externa dos inputs capturados e settlement; abrir um novo writer e inspecionar fatos não reconstrói por si só a intenção perdida. A integração futura com recibos de execução/restart de P100-020 continua obrigatória e não recebe PASS nesta fundação.

Estado de reconciliação: UNKNOWN→PENDING_SETTLEMENT→COMMITTED|ABSENT|CONFLICT, sem classificação terminal a partir de leitura prévia ao fence. A conexão antiga é destruída/quarentenada e jamais libera voluntariamente seu session lock antes de conhecer o resultado final; sem nova conexão para o mesmo handle. `owner.reconcileAttempt` tenta em **nova sessão física** o mesmo session try-lock original, por chave autêntica do ticket. Busy/erro/timeout retorna pending, mesmo que um SELECT anterior não encontre nenhum evento. Tomar esse lock após perda da sessão antiga constitui fence de settlement, não apenas observar socket fechado; mantê-lo durante a verificação e liberar/destroy em finally. Se outro writer já o possui, permanecer pending até um fence posterior; não roubá-lo.

Depois do fence, abrir **um único snapshot REPEATABLE READ fresco** no primário para header/cut, head e todos os IDs/digests/sequence do batch; consultas paginadas ficam na mesma transação. Para append: todos os registros exatamente iguais→committed; nenhum ID, com prefixo anterior validado e nenhum conflito→absent; ID com digest/ordem diferente→conflict. Conjunto parcial só é corruption depois desse fence/snapshot e validação do prefixo, jamais por leituras em snapshots diferentes. Para create: header/cut/id iguais e chave original→committed; nenhum stream→absent; stream divergente ou outra chave→conflict, sem atribuir a outro create o sucesso original. Nenhuma categoria implica retry automático.

Essa escolha evita classificar uma transação com múltiplos snapshots que podem observar commits diferentes; é desenho derivado das regras de isolamento, não prova nativa de recovery. [Isolamento PG16](https://www.postgresql.org/docs/16/transaction-iso.html).

Para flush incerto, encontrar os eventos alvo prova presença lógica, **não** completion/durabilidade da barreira original: retornar `status:'barrier-unknown'` mesmo após settlement. Apenas `reestablishDurability:true` explícito permite emitir uma nova barreira síncrona da seção7 na sessão de recuperação sob o mesmo lock, sem reenviar eventos. Ela produz `status:'durability-reestablished'` para o prefixo alvo validado, com novo attemptId; não declara retrospectivamente que o flush antigo completou. Erro dessa nova barreira gera novo ticket/unknown. Resultado público é união discriminada `pending|committed|absent|conflict|barrier-unknown|durability-reestablished`, incluindo kind/sessionId/attemptId e categoria/causa segura, sem handle reutilizado. Nenhuma reconciliação chama tool, modelo ou approval.

Adapter público `sessionEventStoreForHandle(handle)` liga a API antiga a um único writer, sem expor conexão/lock key. openSession só verifica tenant/id/version desse handle, idempotente sem criar; append captura input v1, consulta eventId/digest e retorna fato prévio em retry idêntico ou conflito se diferente. Para evento novo, atribui sequence/fingerprint pelos helpers CVG existentes e usa o batch/mesma fila owner. read traduz afterSequence exclusivo e limit existentes; não muda dados/ordem. Não criar adapter gravável para reader/lost/closed.

Factory e helper ficam no mesmo módulo de `@cvg/persistence`, usando WeakMap privado handle→capability. Só handles genuínos writer emitidos por essa factory (e ainda ACTIVE) são aceitos; wrapper, Proxy, clone e implementação externa de interface recebem TypeError síncrono sem IO. A capability contém tenant confiável inclusive em stream vazio, lifecycle owner, fila única e primitive privada `appendInputAtomic(snapshot)`; não é propriedade pública nem export de deep import. Vários adapters para o mesmo handle compartilham essa única capability, não filas próprias.

No append do adapter, capturar/validar input antes do await e admitir **um único ticket** na fila comum. Quando executar, dentro da mesma transação/conexão owner: checar tenant/id/version, buscar eventId/digest, selecionar cursor corrente, materializar fato e persistir/avançar cursor. Não implementar por `await handle.read(); await handle.append()` nem chamar a fila pública novamente a partir de uma tarefa enfileirada. Primitivas SQL internas são chamadas diretamente pela tarefa owner; flush/close/append direto usam a mesma admissão. Dois appends adapter distintos recebem sequências consecutivas; duplicata idêntica retorna um único fato; diferente digest é conflito. Append direto mantém sequência explícita do chamador e pode falhar como stale se outro ticket anterior ocupou aquela sequência, nunca renumerar seu input.

No adapter antigo manter SessionEventError: input inválido→invalid_session_event, digest distinto→session_event_conflict, stream errado/ausente→session_not_open; busy/lost/closed/commit-unknown/IO→session_storage_unavailable com cause segura e mensagem sem retry automático. Consumidor novo usa erros precisos do handle. Wire SDK existente não ganha enum incompatível nesta SPEC. Provar integração com CvgSDK/factory/kernel/session reais, não somente classe mock. A ponte não traduz eventos4→1 nem produz fork de histórico com IDs de outro stream.

## 9. Migração, adoção e recuperação

1. Somente após T3 explícito: criar migration aditiva revisada e fixture privada PG16. Congelar preimage de schema/migration/tabelas/dados sintéticos, testar restore e full prefix/digests. Volumes e janela de produção são UNKNOWN; esta proposta só autoriza futura execução local sintética se aprovada.
2. Quiescer writers/dispatch da fixture, aplicar expansão/triggers em transação com lock_timeout/statement_timeout5s. Contenção/timeouts abortam sem retry em loop. Ledger de checksum do runner atual permanece autoridade. Grants mínimos e namespace advisory são conferidos antes de ligar runtime.
3. Inventariar streams históricos headerNULL. Produzir manifesto de adoção explícito por tenant/session com header/cut/proveniência e expected next_sequence/digest ordenado. CreatedAt não pode ser inventado por first-event nem NOW. Ausência de metadata confiável mantém migration-required; não apagar/omitir sessão para fazer list passar.
4. Adoção, com autoridade migration e writers parados, usa lotes de no máximo100 streams/uma transação por lote, ordem tenant/session estável, CAS de cursor/digest e metadataNULL. Registro já adotado idêntico é no-op; divergente é conflito/stop. Reconciliar hashes/counts/cut/header antes de checkpoint, inclusive após interrupção/ACK desconhecido. Sem tocar eventos históricos.
5. Ligar API somente quando nenhuma sessão visível do escopo opt-in tem metadata ausente, preflight aprovado e prova de coexistência concluída. Alternativamente, esquema dedicado novo e vazio evita adoção, mas não demonstra migração do v1 existente; ambos os casos são obrigatórios na qualificação.
6. Rollback de aplicação pode desabilitar a API e fechar handles, mantendo colunas/triggers/dados. Writer legado continua submetido aos guards. Não remover expansão, reusar lock IDs, apagar headers ou restaurar snapshot sobre fatos novos. Se houver erro estrutural, parar writers e fazer roll-forward; restore somente no recurso sintético próprio após preservar fatos novos e verificar replay sem efeitos.

Compatibilidade exigida: app antiga/schema antiga permanece baseline; app antiga/schema expandida lê fatos iguais e recebe busy seguro sob owner; app nova/schema antiga recusa preflight; app nova/schema expandida sem adoção recusa migration-required; app nova/schema completa opera; rollback de app mantém fatos novos legíveis ao leitor v1. Não conceder release nem rollout institucional a partir desta matriz local.

## 10. Plano de construção e aceitação futura

Fatia vertical obrigatória: serviço público tenant-bound→create writer→adapter→SDK real com modelo sintético→append v1→flush→morte abrupta do processo→open em outro processo→read idêntico. Contratos/factory/DB guard/migration/erros/lifecycle/fixture devem ser integrados antes de qualquer claim funcional. Stubs só em provider/modelo, nunca em banco, owner, SDK/kernel ou promises de durabilidade.

Arquivos futuros candidatos: contracts/src/session-persistence.ts e barrel; harness/src/session/materialization.ts e barrel; persistence/src/session-persistence.ts, connection-lease.ts, exports e migration nova; testes unitários e integração PG nas respectivas pastas, consumidor público e procedures em tests/differential. Documentar PUBLIC_API. Paths exatos/claims e número de migration são confirmados no BUILD; nenhum consumidor de produto é importado. Matcher/exceções de boundary0220 não estão autorizados por0221: novos diagnósticos exigem proposta própria, nunca ampliar allowlist por conveniência.

| ID   | Evidência obrigatória, sempre NOT_RUN nesta proposta                                                                                                                                                                | Controle que precisa falhar                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| SP01 | Consumidor compilado por exports públicos; duas views da mesma instância/substituição; metadata detached (SD01/03)                                                                                                  | deep-import-only/identity mutável/alias header                                                 |
| SP02 | Create colide, open não cria, empty aparece em stat/list; cut seeded0 e cut maior que corpo preservados (SD02/03)                                                                                                   | upsert/missing-cut/cut inferido                                                                |
| SP03 | Dois processos competem por mesmo writer, leitores livres, sessões/tenants distintos progridem (SD04)                                                                                                               | mutex só em processo/chave colidente                                                           |
| SP04 | Terminar sessão PG owner real, novo processo abre, handle velho nunca revive (SD05)                                                                                                                                 | reconectar ou reborrow silencioso                                                              |
| SP05 | Batch sequence contíguo/duplicado/gap/ordem/payload/fingerprint; falha no meio rollback integral (SD06/16)                                                                                                          | sort/drop/partial commit                                                                       |
| SP06 | Getter A/B uma leitura; alias alterado durante IO; −0/nonJSON/createdAt/limites/Unicode/escapes (SD07)                                                                                                              | duas capturas/cópia pós-await/coerção                                                          |
| SP07 | Slices/defaultrest/empty/offset/ownership detached; corrupção fora da fatia recusada (SD08/15)                                                                                                                      | off-by-one/array compartilhado                                                                 |
| SP08 | Barreira IPC após ACK, reads iniciados depois em outros handles/stat/list; monotonicidade (SD09)                                                                                                                    | cache stale/regressão                                                                          |
| SP09 | Create vazio e batch após flush sobrevivem kill de app e crash/restart do PG16 próprio (SD10)                                                                                                                       | flush só memória/COMMIT somente leitura                                                        |
| SP10 | Close e asyncDispose isolado em handles frescos writer/reader; drain, promise repetida, timeout/falha (SD11)                                                                                                        | dispose no-op/unlock antecipado                                                                |
| SP11 | Global flush captura antes do await, allSettled, erro de A não abandona B, close falho agregado (SD12)                                                                                                              | fail-fast/captura tardia/flush reader                                                          |
| SP12 | Stat/list só metadata; revision muda após append real e não após churn/flush (SD13)                                                                                                                                 | revision constante/body IO/contagem-byte                                                       |
| SP13 | Cada método com pre-abort e abort na fila sem IO; pós-início com resultado/unknown conservado (SD14)                                                                                                                | AbortError sem verificar estado                                                                |
| SP14 | Erros distintos e causas por rota real; unsupported/corrupt, headerNULL, schema antiga (SD15/16/17)                                                                                                                 | erro genérico/upgrade oculto                                                                   |
| SP15 | Transação incompleta/crash nunca expõe evento parcial nem altera prefixo durable (SD18 PG)                                                                                                                          | leitura parcial/rollback fictício                                                              |
| SP16 | Store legado não modificado sob owner; interleaving row-before-advisory, dedup read-like, inserção sem cursor (G06)                                                                                                 | advisory sem trigger/trigger bloqueante                                                        |
| SP17 | Roles non-owner/RLS/grants mínimos, tenants com mesmo ID, key schemas distintos e tentativa DDL (G06)                                                                                                               | role superuser/BYPASSRLS/UPDATE metadata                                                       |
| SP18 | Pausar COMMIT original/perder ACK; recover antes/depois do settlement e concorrente com outro writer, único snapshot; create/append/flush, nova barreira apenas explícita (G11)                                     | ausência precoce/mixed por snapshots/retry cego/presença tratada como flush completo           |
| SP19 | Migração v1 povoada/adoção/restart lotes/CAS/restore/rollback app, comparação byte/lógica de fatos                                                                                                                  | NOW histórico/eventos reescritos                                                               |
| SP20 | Fatia SDK real em dois processos; stream vazio wrong-tenant/foreign-handle, dois adapters concorrentes, duplicatas/digests distintos, ordem adapter/append direto/flush/close; restart sem novo model/tool/approval | duck typing/fila paralela/read-then-append/log espelho/mock kernel                             |
| SP21 | Shutdown durante aquisição de lease, após lock e durante COMMIT; writer/reader tardios recolhidos, outcomes create explícitos, repetição/aggregate failures/deadlines/join (G11/12)                                 | publicação após shutdown/lease tardio solto/sessão pooled locked/abort limpo de create incerto |
| SP22 | Cursor inválido/corrupção histórica/saturação int4/safe-int/attempts consumidas sem reuso                                                                                                                           | CYCLE/head saltado/evento perdido                                                              |

Para cada SP: comando/exit, versão/toolchain/build, schema/roles, PID/deadlines, fonte hashes pre/post, inputs sintéticos, transcript semântico nativo, controles known-bad e cleanup. Processo filho tem prazo máximo180s, execução5s por operação salvo crash recovery explicitamente medido, teardown TERM1s/KILL2s/join5s; deadline não altera TTL de execução0217. Sem provider/rede externa/dado real/perfil usuário. PostgreSQL novo isolado/loopback/portas/volume próprios sob claim; não reutilizar PG217 reservado.

SD01–SD18 permanecem procedimentos diferenciais futuros: SP cobre apenas a parte CVG PG e não aprova fonte/lib/ABI da referência. Testar referência por backend público qualificado, manter raw native outcomes e só projeção declarada lossless. SD05 nativo da referência pode continuar desconhecido: export de erro não prova backend com loss; SD18 JSONL exige futuro backend físico próprio, não é dispensado por SP15. Todos os75 IDs, quatroUNKNOWN e duas superfícies preservados em bindings do pacote; nenhum PASS por tabela.

Antes de encerrar BUILD: Node22 typecheck/lint/npm test/test:postgres/E2E e certificação da candidata própria atual, links/format, boundary e regressão dos stores/SDK0217. Falhas históricas216 e necessidade de0220 não são ignoradas; obter gates próprios e preservar negativos antigos. Nova revisão I1 fresca da fatia integrada, hashes atuais e sem achados materiais obrigatória; aprovação humana T3 precede qualquer código/API/schema/segurança desta SPEC. Provas e contrato completo pendentes impedem fechamento de P100-015/P100-020 e da meta36.

## 11. Estado de decisão

Desenho proposto, nenhum teste SP executado, nenhum novo backend/API/migration implementado. Desconhecidos operacionais de produção e compatibilidade do vocabulário4 permanecem explícitos. Próxima ação: crítica técnica fresca do pacote congelado, correção de achados e só então apresentar uma revisão concreta para decisão humana. Não repetir o pedido0220 nem deduzir aprovação de continuação automática.
