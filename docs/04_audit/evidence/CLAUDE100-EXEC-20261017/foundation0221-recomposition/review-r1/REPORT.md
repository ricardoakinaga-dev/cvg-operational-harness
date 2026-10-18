# SPEC0221 — crítica independente R1, lane T1

**APPROVE_APPROVED_ADJUSTMENTS — 0 obrigatórios; nenhuma correção mínima.**
A recomposição aplica somente os cinco ajustes aprovados e mantém um contrato
coerente como delta normativo fechado do original. Crédito funcional: **0**.
Crédito de BUILD: **0**. `BUILD_ENTRY_READY=false` permanece.

Revisão estática por crítico fresco, sem participação na redação, implementação
ou delegação. A autoridade é a decisão canônica de 16/10/2026, não o estado
histórico PROPOSED nem os pedidos humanos anteriores ainda citados em ledgers.
Esta aprovação se limita à fidelidade documental; não altera estado contratual
do Lead, gates, backlog ou catálogo central.

## Base congelada e evidência

- [Proposta examinada](../adjusted-spec-proposal.md), SHA-256
  `f64a1b8991cac8ecab2082c7b44768002ee1723fd419d5c51572c003e6283d37`;
  [snapshot inerte](snapshots/proposal.source.txt).
- [Original0221 preservado](../../../../../02_spec/0221_pare100_public_session_persistence.md),
  SHA-256 `1f9490ccee25f246e57a7c9c096c41c2572818c60e2c7bae5a4d315ad8e170e4`;
  [snapshot inerte](snapshots/original0221.source.txt).
- [Decisão canônica](../../../USER-DECISIONS-20261016/spec-gates.json), SHA-256
  `282c8e6be6ff6f67c1806c1a46663eedc1ccf652b16be43d43934fa822ad7d27`;
  [snapshot inerte](snapshots/canonical-decision.source.txt).
- [Task](../task.json), [freeze R1](../proposal-freeze-r1.json),
  [recon](../recon.json) e [claim previamente registrado](snapshots/scope-claim.source.txt).
- [Aceite do PAR-S01](../../../../../03_build/0380_backlog_paridade_100_deepseek.md),
  seção que inicia na linha351; [snapshot inerte](snapshots/par-backlog.source.txt).

A `bindingRule` permite aplicar somente os ajustes com revisão técnica
independente, sem repetir gate humano. Ampliação de contrato, schema ou segurança
continua exigindo autoridade própria. Os números de linhas abaixo referem-se à
proposta congelada, cujo snapshot tem os mesmos bytes.

## Disposição dos cinco ajustes

| Ajuste                        | Evidência na proposta           | Julgamento                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 — primeira fatia           | §§1–3, linhas13–98              | PASS documental. Mantém dono exclusivo e create/open/read/append/flush/close; asyncDispose é o mesmo close. Factory retorna `{ service }`; owner global, stat/list/revision, flush agregado, tickets/reconciliação e shutdown agregado ficam adiados. |
| A2 — provas reduzidas         | §6, linhas163–196               | PASS documental. S1 mesmo log entre processos; S2 disputa de ownership; S3 writer antigo; S4 tenant; S5 ACK/kill/reopen e handle perdido terminal. Não impõe os22SP por cinco aliases.                                                                |
| A3 — migration sem colisão    | §5 e §7, linhas141–161 e198–215 | PASS documental.0031 vem após0029 e0030/0225; mantém expansão/adoção do v1. Nenhum SQL foi criado, executado ou renumerado nesta revisão.                                                                                                             |
| A4 — precondições de conexão  | §§2,4, linhas39–45 e104–139     | PASS documental. maxOpenWriters, deadline/reserva e sessão física exclusiva são explícitos; PgBouncer transaction e reconnect transparente são recusados, sem capacidade de produção presumida.                                                       |
| A5 — consumidores posteriores | §§2,7, linhas47–52 e198–215     | PASS documental. PAR-S04/S05 aguardam gate/aceite próprio; dependências abertas, BUILD false e saldo integral de paridade são preservados.                                                                                                            |

O delta define sua precedência nas linhas13–20 e conserva as regras do original
aplicáveis aos métodos retidos. Por isso, não precisa republicar todos os tipos,
erros e algoritmos nem promover a segunda fatia para ser coerente.

## Fronteiras que poderiam invalidar a redução

A factory somente com `service` é consistente com adiar o owner agregado.
A composição continua dona do pool; o port físico público já estava previsto
no original, linhas109–134. A exclusão dos tickets de lifecycle do shutdown
global não exclui responsabilidade por operação, fila ou lease tardio.
Close continua sincrônico na admissão, memoizado, drenando e recolhendo uma vez
(proposta83–98; original192–204). Não há owner público global residual exigido
para o primeiro BUILD.

A ponte `sessionEventStoreForHandle` já era suporte previsto no original,
linhas222–228. A proposta47–52 incorpora expressamente essa semântica, com
capability privada genuína, tenant confiável, fila comum e append atômico;
a ausência de uma nova definição de WeakMap no delta não revoga sua exigência
original. O [contrato v1 atual](../inputs/03-session-events.ts.source.txt)
possui openSession/append/read. O [store atual](../inputs/04-session-events.ts.source.txt)
atribui sequência sob row lock, faz dedup por eventId/digest e persiste no mesmo
log0028. [Composição SDK](../inputs/10-composition.ts.source.txt) e
[servidor SDK](../inputs/11-server.ts.source.txt) recebem esse store, e o
[barrel atual PARE-W](../inputs/08-index.ts.source.txt) ainda não publica a nova
factory. Logo, suporte ao SDK não constitui API recém-implementada nem autoriza
fork/search ou prova integral SP20 como condição documental desta redução.

Unknown continua unknown: proposta62–64 e91–98 impede substituir ticket por
recovery automático por ID, sucesso fabricado, retry ou reconexão do handle.
O handle perdido fica terminal; a liberação real do lock pelo PG continua
necessária, e socket destruído não prova settlement remoto (120–124).
A leitura posterior de fatos não recupera a intenção de uma tentativa sem ACK.
O read permitido ao handle LOST antes de close no original180 não é revogado
pela proibição de reviver ownership.

Ownership e segurança permanecem: chave OID/int4 sem colisão/reuso, try-lock
transacional nos guards INSERT/UPDATE, constraint diferida, imutabilidade,
interleaving row-before-advisory sem espera, leitores livres e dedup sem mutação
(proposta104–139; original154–182). Tenant autenticado, RLS/grants reais,
non-owner, preflight, recusa de schema incompatível e ausência de grants PUBLIC
ou SECURITY DEFINER novos continuam normativos. A [migration0028 atual](../inputs/05-0028_session_events.sql.source.txt)
ainda só fornece a baseline; não se confunde seu RLS existente com os guards
novos propostos.

As demais invariantes dos métodos retidos continuam por incorporação explícita:
captura única antes de await, limites originais, detached snapshots, sequência
contígua, batch atômico, prefixo validado, erros distintos e barreira de flush
com escrita/WAL. A [validação v1 atual](../inputs/09-events.ts.source.txt) não é
prova de implementação do novo materializador lossless. NUL em JSONB continua
fora da solução; a proposta não se apropria da correção do journal0225.

## Redução das provas e dependências

O aceite do PAR-S01 exige mesmo log entre processos sem lacuna/duplicata,
recusa de writer antigo e nenhum dado para outro tenant; a decisão acrescenta
kill/reabertura ao recorte. S1–S5 tornam isso observável com negativos e ACK/IPC,
sem exigir a matriz de22famílias. Regressões proporcionais de fila, captura,
cleanup, erros e migration verificam os contratos mantidos; não importam
stat/list/global flush/recovery/shutdown adiados. SP11/12/18/21 e as parcelas
adiadas são explicitamente futuras. Não exijo outro ensaio de crash/restart do
PG, drill completo de restore/rollback, recovery ticket ou shutdown agregado
para aprovar este delta.

Adoção por manifesto/CAS de até100 streams, metadata confiável e preservação
dos fatos continuam regras de migration; o primeiro esquema vazio não finge
migração histórica. O inventário de arquivos foi reconferido por leitura:
[0029 apenas em PARE-W,0030/0031 ausentes em root e PARE-W](integrity/migration-inventory.json).
O [runner PARE-W](../inputs/07-postgres-migrations.ts.source.txt) mantém checksum
e o port [pool atual](../inputs/06-tenant-scoped-postgres.ts.source.txt) não prova
por si só o lease físico novo. Nenhuma função desses arquivos foi executada.

0029 não integrada,0030/0225 não implementada e PAR-K03/qualificação composta
continuam dependências. Esta revisão não certifica DG08/TH06 da outra lane.
Os75bindings/18SD,71STATIC/quatroUNKNOWN/duas superfícies e denominador44132,
assim como117resultados+17controles, não recebem crédito. O estado histórico
“SPEC0221 pendente” no backlog não sobrepõe a decisão canônica posterior nem
justifica repetir a pergunta já resolvida.

## Integridade, checks T1 e entrega

Os27inputs do freeze conferem em tamanho e SHA-256 antes/depois; os12pares
fonte/snapshot também conferem byte a byte antes/depois. Foram protegidos41
caminhos: os27inputs, o próprio freeze e13fontes/contextos adicionais do root.
As três diferenças root/PARE-W em tenant-scoped-postgres, postgres-migrations
e index já constam do recon e foram preservadas; não são drift do freeze.

- [Hashes antes](integrity/before.json), [pares antes](integrity/pairs-before.json)
  e [comparação depois](integrity/after.json).
- [Checks de links relativos, Markdown e JSON do próprio pacote de revisão](integrity/t1-checks.json).
- [Resultado estruturado](result.json), [findings e matriz de critérios](findings.json)
  e [manifesto SHA-256 dos outputs](integrity/manifest.json).

Nenhuma fonte, proposta, task, recon, freeze, configuração, ledger ou catálogo
foi editado. `source_changes=0` refere-se aos arquivos protegidos examinados;
não atribui ao crítico a ausência de mudanças de outras lanes no repositório
compartilhado. Escritas somente em review-r1. Snapshots `.source.txt` foram
tratados como bytes/texto inertes. Nenhum app/test/probe/PG/Docker/provider,
referência ao vivo, rede, instalação ou gate amplo foi executado.

Não há achado obrigatório nem melhoria opcional condicionando o aceite.
Nenhum retrabalho ou R2 foi consumido. A aprovação é desta fidelidade documental;
o Lead mantém responsabilidade exclusiva por continuidade e eventual próxima
unidade, após as dependências e claims próprios, sem ampliar a autorização.
