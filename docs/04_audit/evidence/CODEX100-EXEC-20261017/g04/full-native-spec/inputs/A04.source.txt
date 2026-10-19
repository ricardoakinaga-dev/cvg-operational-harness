# SPEC0221 — recomposição da primeira fatia aprovada de sessões

Task `C100-FND-SESSION-0221-RECOMPOSE-001`. Estado: **T1 PARA REVISÃO
TÉCNICA; BUILD_ENTRY_READY=false**. Nenhum código, API, migration, prova SP ou
requisito funcional foi implementado nesta unidade.

## 1. Autoridade e regra de leitura

O [original0221](../../../../02_spec/0221_pare100_public_session_persistence.md),
SHA-256 `1f9490ccee25f246e57a7c9c096c41c2572818c60e2c7bae5a4d315ad8e170e4`,
permanece intacto. A [decisão humana](../../USER-DECISIONS-20261016/spec-gates.json)
aprovou SOMENTE esse desenho com cinco ajustes. Aplicar apenas esses ajustes
exige revisão técnica independente, sem outro gate humano. Ampliação de
contrato, schema ou segurança exige gate próprio; esta cópia não o concede.

Este documento é um **delta normativo fechado sobre o original**, não uma
segunda API completa. Prevalecem as substituições enumeradas abaixo; o restante
das regras do original aplicável aos métodos retidos continua obrigatório.
Trechos expressamente adiados não são requisitos do primeiro BUILD e também
não são classificados como implementados ou dispensados da paridade integral.
O estado histórico PROPOSED do original não sobrepõe a decisão humana posterior.

| Ajuste humano                                                                             | Aplicação nesta cópia                                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Dono exclusivo, create/open/read/append/flush/close e migration; ticket e shutdown depois | Seções 2–4: API básica e ownership; recuperação por ticket e shutdown agregado adiados  |
| Provas reduzidas ao PAR-S01: dois processos, writer antigo, tenant, kill/reopen           | Seção 6: cinco testemunhos S1–S5, sem executar a matriz SP01–SP22 completa              |
| Número sem colisão com0225                                                                | Migration0031, após0029 e0030; inventário atual e novo claim antes de BUILD             |
| maxOpenWriters e sem PgBouncer transaction como pré-requisitos                            | Seção 4: conexão física por writer, limite obrigatório e recusa de pooling incompatível |
| PAR-S04/S05 só consomem depois do gate                                                    | Seção 7: dependentes continuam bloqueados; nenhuma feature fork/search publicada aqui   |

## 2. API da primeira fatia e partes adiadas

Retêm-se os contratos originais de `SessionHeaderV1`, `SessionAccess`, opções
de create/handle e `SessionHandle`, com seus métodos `read`, `append`, `flush`,
`close` e `Symbol.asyncDispose` como a mesma operação de close. Retêm-se
`SessionPersistence.identity`, `create` e `open`. O flush desta fatia é o do
handle escritor, não o flush agregado de serviço.

Na factory `createPostgresSessionPersistence`, a entrada permanece pool físico
qualificado + tenant/schema confiáveis + maxOpenWriters. O retorno da primeira
fatia contém `{ service }`; o `owner` público do desenho completo fica adiado.
O port físico necessário a essa factory e seus tipos pertencem à mesma entrada
pública, sem deep import e sem aceitar reconnect transparente por duck typing.
A composição continua responsável por seu pool; não se adiciona uma API de
shutdown do serviço nessa fatia.

A ponte já prevista `sessionEventStoreForHandle` permanece apenas suporte ao
SDK existente no mesmo log v1: capacidade privada genuína, tenant confiável,
fila única e append atômico. Não adiciona outro método de persistência nem outro
log; sua semântica original da seção8 é mantida, exceto tickets de recuperação
adiados. Ela não habilita PAR-S04/S05. Não trocar kernel/SDK por mocks numa
futura alegação de integração pública.

Ficam para fatia posterior: `stat`, `list`, revisão/snapshot de metadata,
`SessionPersistence.flush()` agregado, `SessionPersistenceOwner.shutdown`,
`reconcileAttempt`, `SessionRecoveryTicket`, `SessionAttemptObservation`,
`reestablishDurability` e a máquina de reconciliação por ticket. Os trechos do
original que dependem exclusivamente dessas superfícies, incluindo tickets de
lifecycle do shutdown global, não entram nos exports ou fixtures do primeiro
BUILD. Os dados header/cut e validações usados por create/open/read permanecem.

Não se implementa automaticamente recuperação por ID como substituto de ticket.
Após perda do processo, reabrir permite ler fatos persistidos; não reconstrói a
intenção de uma tentativa sem ACK e não autoriza repetir efeitos.

## 3. Invariantes retidos sem ampliar escopo

- Tenant é vinculado pela composição autenticada, nunca por header/options
  fornecidos para escolher outro escopo. RLS e grants reais continuam exigidos.
- `create` rejeita duplicata e só publica writer após COMMIT conhecido;
  `open` não cria. Read handle não adquire owner. Header/cut explícitos e
  metadata detached seguem as validações originais, sem header artificial.
- Mantêm-se captura única antes do primeiro await, JSON lossless limitado,
  limites originais header64KiB/profundidade64/nós20mil/evento1MiB/batch8MiB,
  aliases/getters, vocabulário CVG v1 e recusa de versão/corrupção. Esta
  recomposição não resolve NUL no corpo JSONB dos eventos v1.
- Append é batch atômico na ordem original, sequência contígua e digest/
  fingerprint reais; não renumerar, descartar ou alterar fatos. Adapter e
  append direto usam a mesma fila; retry idêntico só retorna o fato já existente.
- Read usa offset0→sequence1, snapshot fresco no primário e validação do prefixo
  completo em páginas internas256, mesmo fora da fatia devolvida. Sem cache
  stale, snapshot duradouro entre chamadas ou alteração dos limites originais.
- A fila de cada handle mantém admissão ordenada, snapshots detached e
  monotonicidade entre reads/append/flush. Close marca CLOSING antes de await,
  memoiza promise/erro, drena a fila, tenta flush e recolhe conexão uma vez.
  Reader close só fecha estado local; closed prevalece sobre readonly/lost.
- Flush do writer mantém a barreira original: UPDATE do cursor para o mesmo
  valor com ownership e COMMIT síncrono que gera WAL no PG16 qualificado.
  SELECT/COMMIT somente leitura não é prova dessa barreira. Não prometer
  tolerância a perda de disco/failover não qualificado.
- Os erros distintos originais aplicáveis à API básica continuam, incluindo
  commit-unknown. Sem ticket público nesta fatia: outcome incerto permanece
  incerto, handle é terminal LOST e a conexão é destruída/quarentenada; não
  reconectar, readquirir owner, retornar sucesso ou fazer retry automático.
- Pre-abort e abort antes de IO não consultam/mutam; depois de IO deve-se
  aguardar resultado/cleanup conhecido ou reportar unknown. Aquisição tardia
  ainda pertence à operação e deve ser recolhida antes de concluir sua limpeza.
  Adiar shutdown agregado não permite soltar leases tardios ou promises órfãs.

As referências normativas de PostgreSQL do original ficam preservadas como
justificativa do desenho histórico. Esta recomposição não fez consulta à rede
nem nova verificação dessas páginas, e não as apresenta como prova executada.

## 4. Ownership, writer antigo e implantação

Mantém-se o mecanismo aprovado: advisory lock de sessão na conexão física
exclusiva; try-lock transacional da mesma chave nos guards das tabelas v1;
nenhuma transação mantida aberta por toda a vida do handle. Chave de dois int4
por OID da relação confiável e writer_lock_id unique positivo NO CYCLE, sem hash
colidente ou reuso. Não alterar namespace/roles ou acrescentar fence de execução.

Os guards de INSERT/UPDATE/constraint diferida e imutabilidade da seção6
original continuam obrigatórios na migration. Writer antigo sem handle é
recusado enquanto há owner; leitor permanece disponível. O caso row-lock antigo
antes de advisory novo usa try-lock sem espera no trigger, evitando ciclo. Fora
de owner, o store v1 mantém seu caminho serializado; replay idêntico sem mutação
pode devolver o fato já persistido. Não classificar essa leitura como segundo
writer nem recusar artificialmente leitores para aparentar exclusividade.

Perda da sessão física torna o handle LOST terminal. Novo processo só reclama
ownership quando o PostgreSQL realmente libertar o lock. O handle antigo não
revive; destruir socket não prova que a transação remota já terminou. Fence de
fatos não impede efeito externo de host antigo: esta fatia usa apenas eventos
sintéticos, sem modelo/provider/canal real ou dispatch institucional.

Pré-requisitos obrigatórios da composição/implantação, já aprovados: declarar
`maxOpenWriters`, deadline de aquisição e pool total com reserva para leitura e
saúde; uma conexão física por writer, sessões simultâneas distintas comprovadas
pelo adapter. Saturação recusa aquisição sem claim parcial ou expulsão. Não usar
PgBouncer em modo transaction, reconnect transparente ou lease que troca backend.
Nenhum número de capacidade de produção é presumido. Na fixture local retêm-se
os dois writers de sessões diferentes, dois leitores e slot de administração do
original; não é novo sizing de produção.

Preflight do original valida schema/migration/checksum, OID/chave, RLS/grants,
triggers/constraints habilitados, primário e parâmetros de durabilidade. Role
serving non-owner sem superuser/BYPASSRLS/DDL e sem desativar triggers;
`SET LOCAL` tenant em cada transação; sem novos grants PUBLIC/SECURITY DEFINER.
Ausência/incompatibilidade falha fechada sem automigração/fallback em memória.

## 5. Migration0031 e adoção

A única renumeração é de0030 candidato no original para **0031**, depois da
0029 de composição e da0030 do journal0225. Esta cópia não reserva filesystem,
não cria SQL nem altera0028/0029. Inventário atual:0029 existe apenas no worktree
PARE100; root não a integrou;0030/0031 ausentes nos dois. Reconfirmar inventário,
claims e dependências antes de qualquer BUILD.

Mantém-se a expansão só de session_streams descrita na seção5 original:
writer_lock_id, header_json text e inherited_event_count pareados; bytes,
sequência, IDs/digests dos eventos históricos intactos. Adoção requer manifesto
explícito de header/cut/proveniência por tenant/sessão, lotes de até100, CAS e
writers parados; nenhum NOW histórico/header derivado do primeiro evento. Dado
sem metadata confiável permanece migration-required. Esquema novo vazio não
substitui a adoção do v1 existente.

A compatibilidade antiga/nova e rollback de aplicação da seção9 original
permanecem regras de implantação: fechar handles, manter expansão/guards/fatos,
não destruir schema nem restaurar sobre fatos novos. A matriz exaustiva de
restore/rollback/crash/recovery não será executada como novo bloco de provas
SP no primeiro BUILD; isso não autoriza operação destrutiva nem cria release.

## 6. Cinco testemunhos locais do aceite reduzido

Todos estão **NOT_RUN**. S1–S5 são planos de prova da primeira fatia, não novos
controles creditados e não repetição obrigatória de SP01–SP22. Usar a API/factory
pública real, PG16 sintético novo e processos realmente distintos. Não usar
mutex in-process, banco mock, fixture com log paralelo ou provider real.

| ID  | Testemunho                                                                                                                                                                                  | Negativo que deve ser detectado                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| S1  | ProcessoA create/append/flush/close e processoB open/read/append/flush no mesmo log v1; prefixo, IDs, sequência e digests exatos, sem lacuna/duplicata; contrato público compilado          | Log paralelo, renumeração, append parcial, export só por deep import                   |
| S2  | Dois processos disputam owner da mesma sessão; só um writer; readers progridem, sessão distinta não bloqueia; adapter físico/grants/preflight reais                                         | Mutex apenas local, chave colidente, proxy que troca backend, writer antigo autorizado |
| S3  | Processo/store legado inalterado tenta append enquanto novo owner está ativo; recusado sem alterar fatos/cursor; incluir interleaving row-before-advisory sem deadlock                      | Guard ausente/bloqueante, trigger contornável, cursor separado do batch                |
| S4  | Dois tenants com mesmo sessionId, roles non-owner/RLS/grants reais; tenantB não recebe fatos/header do tenantA e seu owner independente progride                                            | Bypass por role elevada, tenant escolhido no input, colisão entre tenants              |
| S5  | ACK de flush conhecido emA, kill abrupto deA sem close, B aguarda liberação real e reabre/relê prefixo exato; perda real da sessão PG em handle ainda vivo prova old handle LOST/não revive | Flush em memória, reconexão automática, handle antigo que volta a escrever             |

O ACK antecede o kill por barreira IPC observável, sem sleeps como prova. Kill
significa processo sintético da aplicação; não autoriza matar PG/serviço de
terceiros. A perda de sessão PG do controle usa somente backend próprio por
identidade registrada. Read não vaza header por erros públicos. Comparar fatos
antes/depois das recusas; não usar só ausência de exceção como aprovação.

Os testes unitários/regressões proporcionais continuam necessários aos métodos
retidos, especialmente fila/captura/cleanup, erros e migration. Não se converte
a matriz SP completa em cinco nomes exigindo secretamente os mesmos22cenários.
SP11/12/18/21 e partes de outros SP dependentes das superfícies adiadas ficam
para fatia futura. Os75bindings,18SD,71STATIC/quatroUNKNOWN/duas superfícies e
saldo44132 do original são preservados sem receber PASS por este recorte.

Evidência futura por testemunho: comando/exit, Node22/toolchain/commit, hashes
pre/post, schema/grants, PIDs/start tokens e IPC, fatos nativos e negativos,
deadlines/cleanup. Retêm-se os prazos da fixture original: operação5s, filho180s,
teardown TERM1s/KILL2s/join5s. Não alterar TTL de execução0217. Gates D12 T2,
certificação corrente/links/formato/boundary e revisão independente da fatia
integrada continuam obrigatórios antes de aceite; nenhuma evidência é herdada.

## 7. Dependências e decisão desta unidade

BUILD_ENTRY_READY permanece false:0029 ainda não integrada no PAR-G01,0030/
SPEC0225 não implementada, PAR-K03/qualificação composta ainda abertos. A revisão
de código diagnóstico aprovada não fecha DG08 nem esse cartão. Esta lane T1 não
usa o PG da certificação nem qualquer recurso de outro agente.

PAR-S04 e PAR-S05 só consomem a API após o gate/aceite próprio desta SPEC;
TODOs/estados canônicos ficam exclusivamente em0380. Não liberar fork/retomada,
search, backend JSONL, vocabulário da referência ou produção por este documento.
Não fechar PAR-S01 sem seus testemunhos e gates atuais; não fechar paridade
integral com uma API básica. O programa117resultados+17controles segue aberto.

Próxima ação documental: revisão técnica fresca da fidelidade aos cinco ajustes,
com original/decisão/fontes preservados. Se aprovada sem escopo extra, não
repetir a pergunta humana0221; preparar BUILD somente após satisfazer dependências
e registrar task/claim/HOW próprios. Se houver ampliação necessária, separá-la
como proposta sob gate próprio, sem atribuí-la à aprovação existente.
