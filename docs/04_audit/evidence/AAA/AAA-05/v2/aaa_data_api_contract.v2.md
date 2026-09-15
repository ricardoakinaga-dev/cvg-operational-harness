# AAA-05 — Contrato de dados, migrações, APIs e ownership (PROPOSTO)

Programa: `AAA-20260912`. Task: `AAA-05`. Data: 2026-09-12. Owner: Agente 2 (dados/persistência). Path proprietário: este documento.

**Revisão 2 (pós-review `AAA05-R3-F01..F04`).** Corrige: (F01) `proposalHash` × `payloadHash` — coberturas diferentes, nunca comparadas; vínculo é a chave; (F02) `FAILED` terminal vs falha recuperável — classificação explícita e remoção do retry de `FAILED`; (F03) referência a AAA-03 rev2 `9df1a05f…`; (F04) fencing textual de toda transição terminal. A revisão 1 `8db1541f…` permanece preservada em `docs/04_audit/evidence/AAA/AAA-05/v1/`. Esta revisão ainda é `PROPOSED_NOT_FROZEN` e exige nova revisão independente por hash.

## 0. Status e autoridade

- `contractStatus: PROPOSED_NOT_FROZEN`. Este documento **não** é uma aprovação de SPEC, não congela hash e não autoriza BUILD.
- Dependências declaradas no JSON canônico: `AAA-01` (baseline revalidado — evidência `READY` em `docs/04_audit/evidence/AAA/AAA-01/`, candidato `512bc11e80fbf7c7b8baf6263aacc811ff829309`) e `AAA-03` (contrato de execução publicado em `docs/02_spec/aaa_execution_contract.md`, revisão atual `9df1a05fdf36293d02e006917f191f0c96e8c1109e4a10d1e9fc49f5d9ef3ff7`, status `DRAFT_FOR_INDEPENDENT_REVIEW`; a revisão 1 `db75899f…` fica preservada como histórico; a reconciliação de identidade está na §3.1).
- Gate aplicável: `G_PLAN` para preparação; `G_SPEC` por task para BUILD, ainda não concedido. A revisão fresca exigida pelo aceite (`fresh critic, read-only`) deve ser feita por agente que não redigiu este contrato.
- Regras preservadas: dados sintéticos, banco descartável, sem canal/provider real, sem ação clínica/financeira/prontuário, sem deploy/commit.
- Este contrato estende os contratos históricos `docs/02_spec/0107_contratos_de_api.md`, `0109_dados_e_persistencia.md`, `0110_consistencia_integridade_e_migracoes.md` e `0113_observabilidade_runtime_e_operacao.md`; onde houver divergência, este documento prevalece apenas após aprovação explícita.

Decisões materiais pendentes de autoridade (não resolvidas aqui):

| ID    | Decisão                                                             | Autoridade              | Impacto se ausente                                     |
| ----- | ------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| D05-1 | Reserva do número de migration para o journal do canal              | Coordenador/lead        | BUILD do adapter SQL não pode começar                  |
| D05-2 | Ownership definitivo do adapter SQL (AAA-10 vs. extensão de AAA-12) | Coordenador/lead        | Handoff fica pendente; apenas adapter local é liberado |
| D05-3 | Retenção aprovada do journal (dias) e TTL de deduplicação inbound   | Operação + segurança    | Limites usam provisórios deste contrato                |
| D05-4 | Provider/canal idempotente ou consultável em homologação            | Integrações + segurança | Reconciliação externa permanece bloqueada              |

## 1. Identidade da operação

Toda operação externa (mensagem outbound de canal, execução de ferramenta, jornada) é identificada por uma chave composta canônica:

```
operationIdentity = (tenantId, channel, operationKind, idempotencyKey)
```

- `tenantId`: `TenantIdSchema` (`packages/shared`), obrigatório; nunca inferido de payload quando já houver contexto confiável.
- `channel`: valor de `ChannelSchema` ou `'internal'` para operações sem canal externo.
- `operationKind`: enumeração fechada. Para canais: `outbound_message`. Reservado: `tool_effect`, `journey_mutation`.
- `idempotencyKey`: string 8–240, estável entre retries. Chaves inbound usam `canonicalIdempotencyKey({tenantId, channel, externalId})`.

### 1.1 Hash canônico do payload

- `payloadHash = sha256(canonicalJson(payload))`, onde `canonicalJson` ordena chaves recursivamente, remove espaços, rejeita `undefined`, preserva arrays na ordem, normaliza datas para ISO-8601 UTC e limita profundidade/tamanho.
- Para `outbound_message`, o payload canônico contém: `conversationId`, `channel`, `recipient`, `body`, `correlationId`, `metadata`. `messageId` e `idempotencyKey` **não** entram no hash (identificam, não descrevem conteúdo), evitando falso conflito por reuso de mensagem idêntica.
- O hash é persistido junto da reserva. Chave igual + hash diferente = `idempotency_key_reuse` (§6), sem qualquer envio.

## 2. Máquina de estados

Estados legais do registro de efeito (`channel_effect_journal` e equivalentes em memória/arquivo):

| Estado      | Significado                                                          | Terminal | Permite envio?        |
| ----------- | -------------------------------------------------------------------- | -------- | --------------------- |
| `PENDING`   | reserva ativa; nenhuma tentativa de envio iniciada                   | não      | sim (lease válido)    |
| `SENDING`   | tentativa de envio iniciada e ainda não concluída                    | não      | não (risco de efeito) |
| `CONFIRMED` | resultado do provider persistido; replay retorna `result`            | sim      | não                   |
| `FAILED`    | falha definitiva sem efeito; replay retorna a falha registrada       | sim      | não (nova chave)      |
| `UNCERTAIN` | efeito pode ter ocorrido; retry cego proibido; requer reconciliação  | não      | não                   |
| `EXPIRED`   | lease vencido sem resolução; estado transitório para takeover seguro | não      | condicionado (§5)     |

Transições permitidas:

```
PENDING  -> SENDING   (claim de envio, CAS com lease token)
PENDING  -> EXPIRED   (lease vencido sem envio)
PENDING  -> FAILED    (falha não-retryável com certeza de não-efeito)
SENDING  -> CONFIRMED (resultado persistido, CAS com lease token)
SENDING  -> FAILED    (provider rejeitou com certeza de não-efeito e sem retry)
SENDING  -> PENDING   (release de falha retryável comprovadamente sem efeito)
SENDING  -> UNCERTAIN (erro sem certeza de não-efeito / crash de lease)
SENDING  -> EXPIRED   (lease vencido durante envio)
UNCERTAIN -> CONFIRMED (reconciliação confirma efeito, com evidência)
UNCERTAIN -> PENDING  (reconciliação confirma não-efeito, com evidência)
```

`FAILED` é **terminal** e não possui transição de saída: replay devolve a falha registrada e uma nova tentativa exige chave nova. Falhas comprovadamente sem efeito que admitem retry **nunca** entram em `FAILED`; elas usam `release` e retornam a `PENDING`. Não existe orçamento de tentativas/backoff/dead-letter implementado no journal do canal nesta revisão (ver §5); qualquer orquestração de retry pertence ao chamador/outbox.

Invariante central: **nenhum envio ocorre antes de uma reserva atômica durável**. Um mutex em memória não satisfaz a fronteira entre processos; ele é permitido apenas como otimização local.

## 3. Porta `ChannelEffectJournal` (contrato de interface)

Interface proposta em `packages/channel-gateway/src/idempotency.ts` (owner do path: AAA-12):

```ts
type ChannelEffectIdentity = {
  tenantId: string
  channel: string
  operationKind: 'outbound_message'
  idempotencyKey: string
}

type ChannelEffectRecord = {
  identity: ChannelEffectIdentity
  payloadHash: string
  state:
    | 'PENDING'
    | 'SENDING'
    | 'CONFIRMED'
    | 'FAILED'
    | 'UNCERTAIN'
    | 'EXPIRED'
  attempt: number
  leaseOwner: string | null
  leaseExpiresAtMs: number | null
  result: OutboundResult | null
  errorCode: string | null
  updatedAtMs: number
  revision: number
}

type ChannelEffectReserveOutcome =
  | { outcome: 'reserved'; record: ChannelEffectRecord }
  | { outcome: 'replay'; record: ChannelEffectRecord }
  | { outcome: 'in_flight'; record: ChannelEffectRecord }
  | { outcome: 'conflict'; record: ChannelEffectRecord }
  | { outcome: 'uncertain'; record: ChannelEffectRecord }

interface ChannelEffectJournal {
  reserve(input: {
    identity: ChannelEffectIdentity
    payloadHash: string
    leaseOwner: string
    leaseMs: number
  }): Promise<ChannelEffectReserveOutcome>
  claimSend(identity, leaseOwner): Promise<ChannelEffectRecord>
  renew(identity, leaseOwner, leaseMs): Promise<boolean>
  complete(identity, leaseOwner, result): Promise<'committed' | 'lease_lost'>
  fail(identity, leaseOwner, error): Promise<'committed' | 'lease_lost'>
  markUncertain(
    identity,
    leaseOwner,
    error
  ): Promise<'committed' | 'lease_lost'>
  find(identity): Promise<ChannelEffectRecord | undefined>
  waitForTerminal(identity, timeoutMs): Promise<ChannelEffectRecord | undefined>
  resolveUncertain(identity, resolution, actor): Promise<ChannelEffectRecord>
}
```

Semântica de `reserve`:

- ausente: cria `PENDING` com lease do chamador (`reserved`);
- `CONFIRMED`/`FAILED` e mesmo `payloadHash`: `replay` com o registro;
- ativo com lease válido: `in_flight` (o chamador aguarda `waitForTerminal`);
- lease vencido em `PENDING`: takeover seguro (`reserved`, novo token/lease);
- lease vencido em `SENDING`/`UNCERTAIN`: marca `UNCERTAIN` e retorna `uncertain`; nunca reenvia sozinho;
- chave existente com `payloadHash` diferente: `conflict`, sem mutação.

Ownership dos adapters:

- **AAA-12 (este owner)** implementa a porta, `InMemoryChannelEffectJournal` (testes/uso efêmero, explicitamente não durável) e `FileChannelEffectJournal` (durável em host único, CAS por arquivo/lock, sobrevive a restart do processo).
- **Adapter SQL** (`packages/persistence/...` + migration) **não pertence a AAA-12** e depende de D05-1/D05-2. Nenhum arquivo de `packages/persistence/`, export ou migration pode ser tocado antes da reserva exclusiva do coordenador. O runtime não muda de adapter por conveniência: sem adapter SQL aprovado, o caminho durável permanece o arquivo local e a limitação cross-host é registrada.

### 3.1 Reconciliação com o contrato de execução AAA-03

O contrato `aaa_execution_contract.md`, revisão atual `9df1a05fdf36293d02e006917f191f0c96e8c1109e4a10d1e9fc49f5d9ef3ff7` (rev1 `db75899f…` preservada como histórico), define `operationKey` e `EffectJournalPort` para o efeito governado do runtime. Os dois contratos descrevem o mesmo invariante em fronteiras diferentes; a composição canônica é:

| AAA-05 (canal)           | AAA-03 (runtime)                 | Regra de composição                                                                                                                                                                                          |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `idempotencyKey`         | `operationKey`                   | Quando o emissor é o runtime governado, `idempotencyKey` DEVE ser o `operationKey`.                                                                                                                          |
| `PENDING`                | `RESERVED`                       | reserva durável antes de qualquer efeito                                                                                                                                                                     |
| `SENDING`                | `EFFECT_STARTED`                 | efeito possivelmente iniciado; lease expirado vira `UNCERTAIN`                                                                                                                                               |
| `CONFIRMED`              | `CONFIRMED`                      | único resultado de sucesso; replay sem novo envio                                                                                                                                                            |
| `FAILED`                 | `EFFECT_FAILED`                  | falha comprovada sem efeito                                                                                                                                                                                  |
| `UNCERTAIN`              | `UNCERTAIN`                      | retry cego proibido; reconciliação explícita                                                                                                                                                                 |
| `EXPIRED`                | `ABANDONED` (lease vencido)      | retomada segura apenas se nenhuma tentativa de efeito iniciou                                                                                                                                                |
| `payloadHash`            | `proposalHash`                   | **coberturas diferentes; nunca comparados**: canal compara `payloadHash` com `payloadHash`; runtime compara `proposalHash` com `proposalHash`; o vínculo entre fronteiras é `idempotencyKey = operationKey`. |
| `channel_effect_journal` | `EffectJournalPort` (tabela/log) | journal do canal é a fronteira de entrega; o do runtime é o efeito governado                                                                                                                                 |

- Partição: o journal do canal identifica `(tenantId, channel, operationKind, idempotencyKey)`; o journal do runtime identifica `(tenantId, operationKey)`. O vínculo entre os dois é a chave, não a tabela; nenhum dos dois pode marcar sucesso sem resultado persistido.
- Binding de hashes (F01): `proposalHash` cobre a proposta inteira (`schemaVersion, tenantId, operatorId, agentId, agentVersion, agentProfile, capability, action, resource, dataClassification, payload`); `payloadHash` cobre apenas a projeção outbound (`conversationId, channel, recipient, body, correlationId, metadata`). Nenhum código compara `proposalHash` com `payloadHash`, e nenhuma decisão de conflito deriva dessa comparação.
- Vínculo verificável: `payloadHash = SHA-256(canonicalJson(proj(proposal.payload)))` com `proj` determinística; o runtime deriva a projeção sem regeneração por modelo e o canal recalcula o hash da mensagem recebida. Divergência que importa no canal é `payloadHash` contra `payloadHash` na mesma linha; reuso de `operationKey` com `payloadHash` diferente é `idempotency_key_reuse`, mesmo que o `proposalHash` não mude.
- Namespaces (AAA-03 rev2 R-ID-5/T-20): notificação de outbox originada pelo runtime usa `operationKey` e namespace `<capability>.executed`; observabilidade do canal usa `channel.outbound.*`. O namespace `channel:<kind>:<channel>:<operationKey>` é **reserva não implementada** e não pode ser confundido com a notificação do runtime; não há deduplicação entre namespaces.
- Código de conflito canônico: `idempotency_key_reuse` (AAA-03 §2), emitido também pelo canal.
- Migrations da sequência pertencem ao Agente 2 (AAA-03 §11); a tabela do journal de canal usa a próxima versão livre após `0011`, reservada pelo coordenador (D05-1).
- AAA-03 §7 aponta o adapter SQL de `EffectJournalPort` em `packages/persistence` (owner Agente 2). O Agente 2 não inicia esse adapter nem a migration sem atribuição explícita e sem cruzar a reserva de `outbox.ts`/`postgres.ts` de AAA-10.

Exemplos canônicos de retry, colisão e mudança de payload (mesma operação lógica = `tenantId + operationKey`):

| Caso                                     | Identidade do canal                                           | `payloadHash` | Resultado esperado                                                                               |
| ---------------------------------------- | ------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| retry idêntico após sucesso              | `(tenant, whatsapp, outbound_message, op:abc)`                | igual         | `replay`; resultado persistido; **0** novos envios                                               |
| retry após falha retryável sem efeito    | mesma                                                         | igual         | `release` → `PENDING`; takeover; um novo envio pode ocorrer; no máximo um `CONFIRMED`            |
| replay após falha não-retryável          | mesma                                                         | igual         | `FAILED` terminal; replay devolve a falha registrada; **0** novos envios; nova chave para tentar |
| chave textual igual em canais distintos  | `(tenant, whatsapp, …, op:abc)` vs `(tenant, web, …, op:abc)` | igual         | **operações distintas** (partição inclui canal); entrega física é independente por canal         |
| chave textual igual em tenants distintos | `(t1, whatsapp, …, k)` vs `(t2, whatsapp, …, k)`              | igual         | **operações distintas**; isolamento por tenant é normativo                                       |
| reuso da mesma chave com payload novo    | mesma                                                         | diferente     | `idempotency_key_reuse`; **efeito 0**; operação nova exige chave nova                            |
| notificação para a outbox                | mesma `operationKey` do runtime                               | —             | a outbox deduplica pela mesma `operationKey` (AAA-03 §8); o journal do canal não escreve nela    |
| notificação própria do canal             | namespace `channel:<kind>:<channel>:<operationKey>`           | —             | só pode ser criada pelo owner do canal; nunca reutiliza a chave de efeito do runtime             |

Regra de colisão: igualdade textual de chave **não** implica a mesma operação quando tenant/canal/kind diferem. Igualdade de conteúdo (`payloadHash`) com chave diferente também não é replay: são operações distintas que podem gerar dois envios deliberados.

## 4. CAS, constraints e transações (adapter SQL proposto)

DDL proposta (número de migration **a reservar**; atualmente a última é `0011_outbox_payload_redaction`):

```sql
CREATE TABLE IF NOT EXISTS channel_effect_journal (
  tenant_id text NOT NULL,
  channel text NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind IN ('outbound_message')),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  state text NOT NULL CHECK (state IN
    ('PENDING','SENDING','CONFIRMED','FAILED','UNCERTAIN','EXPIRED')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  result jsonb,
  error_code text,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, channel, operation_kind, idempotency_key)
);
```

Regras:

- Reserva: `INSERT ... ON CONFLICT DO NOTHING`; se `0 rows`, `SELECT ... FOR UPDATE` da linha existente e decisão pela máquina de estados.
- Transições sempre por CAS explícito com token e revisão: `UPDATE ... WHERE state = $expected AND revision = $revision AND lease_owner = $token`; a única operação que troca o token é o takeover de lease vencido, também sob CAS de revisão.
- Fencing (F04): `complete`, `fail`, `markUncertain` e `release` exigem `lease_owner = $token`; token divergente retorna `lease_lost` e não sobrescreve resultado de terceiro. O adapter em arquivo aplica a mesma regra via lock + rename atômico.
- `result`/`error_code` são preenchidos uma única vez; `CONFIRMED` e `FAILED` são imutáveis exceto `resolveUncertain`.
- Toda operação roda em transação `READ COMMITTED` com retry limitado (2) em `40001`/`40P01`. Nenhuma transação envolve I/O de rede.
- `UNIQUE` de auditoria: um evento `channel.effect.*` por transição terminal, com `correlationId` obrigatório.

## 5. Lease, expiração, retry, heartbeat e recuperação

- `leaseMs` default 30s; `leaseOwner` = `${host}:${pid}:${instanceId}`; heartbeat renova a cada `leaseMs/3` enquanto o envio estiver em andamento.
- Falhas comprovadamente sem efeito: `retryable=true` → `release` para `PENDING` (retry permitido com a mesma chave); `retryable=false` → `FAILED` terminal. O journal do canal **não implementa** orçamento de tentativas, backoff ou dead-letter nesta revisão; retry/backoff/DLQ pertencem ao chamador/outbox existente (`packages/persistence/src/outbox.ts`) e não são prometidos por este contrato.
- Lease vencido em `PENDING` → takeover com fencing: o trabalhador atrasado que tentar `claimSend`, `complete`, `fail`, `markUncertain` ou `release` recebe `lease_lost` e não produz efeito nem sobrescreve resultado.
- Lease vencido em `SENDING` → `UNCERTAIN`; nenhum retry automático. Reativação apenas via `resolveUncertain` com evidência (provider idempotente, consulta de resultado, ou intervenção humana auditada).
- Trabalhador atrasado nunca publica `channel.outbound.sent` se perdeu o lease.

## 6. Chave reutilizada com payload diferente

- `reserve` com mesmo `(tenant, channel, kind, key)` e `payloadHash` divergente retorna `conflict` e o gateway lança `ChannelError('idempotency_key_reuse', retryable=false)` sem chamar o adapter.
- A resposta HTTP equivalente é `409` com código estável `idempotency_key_reuse` e `correlationId`; o payload rejeitado não é ecoado.
- Operação nova exige chave nova; nunca "atualizar" o payload de uma chave existente.

## 7. Matriz de crash por fronteira

| #   | Fronteira do crash                          | Estado durável | Efeito externo | Recuperação esperada                                       |
| --- | ------------------------------------------- | -------------- | -------------- | ---------------------------------------------------------- |
| 1   | antes da reserva                            | inexistente    | não            | retry cria reserva e envia uma vez                         |
| 2   | após reserva, antes de `claimSend`          | `PENDING`      | não            | takeover pós-expiração envia uma vez                       |
| 3   | após `claimSend`, antes de chamar o adapter | `SENDING`      | não            | pós-expiração vira `UNCERTAIN`; reconciliação decide       |
| 4   | durante o envio (resposta perdida)          | `SENDING`      | incerto        | `UNCERTAIN`; sem retry cego; reconciliação                 |
| 5   | após envio, antes de `complete`             | `SENDING`      | sim            | `UNCERTAIN`; reconciliação confirma e registra o resultado |
| 6   | após `complete`                             | `CONFIRMED`    | sim            | replay devolve o `result` persistido; nenhum novo envio    |
| 7   | após `fail` permanente                      | `FAILED`       | não            | replay devolve a falha; nova operação só com chave nova    |
| 8   | durante `resolveUncertain`                  | `UNCERTAIN`    | incerto        | retry idempotente da própria resolução; sem novo envio     |

O caso 4/5 é a fronteira honesta: **sem idempotência ou consulta do provider, exactly-once não é prometido**. O contrato promete no máximo um envio confirmado por operação e trata o resto como incerteza explícita + reconciliação.

## 8. Retenção, limites e memória

- Retenção provisória do journal: `CONFIRMED`/`FAILED` por 30 dias; `UNCERTAIN` nunca expira automaticamente (requer resolução). Valor final aguarda D05-3.
- TTL de deduplicação inbound mantém o default vigente de 7 dias (`InboundDeduplicator`), configurável e auditável.
- Limites de payload: 8.000 caracteres de texto, 10 anexos, 25 MiB por anexo (contrato vigente `contracts.ts`); payload serializado do journal ≤ 64 KiB (alinhado a `DEFAULT_OUTBOX_MAX_PAYLOAD_BYTES`).
- Adapter em arquivo: `maxEntries` com poda apenas de estados terminais vencidos; `UNCERTAIN` e `PENDING` nunca são podados. `result` é armazenado já redigido/allowlisted (apenas `externalId`, `channel`, `accepted`, `sentAt`).

## 9. APIs, eventos e erros

- Sem novas rotas HTTP nesta task. As rotas de canal permanecem `POST /v1/webhooks/channels/:channel/messages` (inbound) e o envio outbound continua interno ao runtime/worker.
- Erros estáveis novos do canal: `idempotency_key_reuse`, `operation_in_progress`, `effect_uncertain`, `lease_lost`, `reconciliation_required`. Todos não-retryáveis por padrão, exceto `operation_in_progress`/`lease_lost` (retryáveis com backoff).
- Eventos de canal existentes preservados: `channel.outbound.sent`, `channel.outbound.blocked`, `channel.outbound.rejected`. Adicionados: `channel.outbound.uncertain` e `channel.outbound.replayed` (allowlisted; sem corpo de mensagem).
- Toda resposta/evento carrega `correlationId` e a identidade da operação; logs nunca incluem corpo clínico nem credenciais.

## 10. Migração, compatibilidade e rollback

- Migrations são **aditivas**, versionadas e checksumadas (`runPostgresMigrations`); nunca editar migration aplicada. Backfill explícito e `NOT VALID` → validação posterior, seguindo `0001`/`0010`.
- A migration do journal só pode ser criada após D05-1 (número reservado) e D05-2 (owner). Esboço de recuperação: `roll-forward` preferencial (tabela nova não altera dados existentes); `rollback` limita-se a `DROP TABLE channel_effect_journal` em banco descartável, nunca em ambiente compartilhado.
- Compatibilidade de leitura: registros sem `payload_hash` legado são tratados como `UNCERTAIN`/quarentena; jamais convertidos em `CONFIRMED` por inferência.
- `script test:postgres` permanece o gate executável; novo caso SQL do journal precisa entrar no script por reserva de arquivo.

## 11. RLS e papéis

- Todas as leituras/escritas do journal no adapter SQL usam `withTenantContext` (`cvg.tenant_id`) e tabela com `ENABLE/FORCE ROW LEVEL SECURITY` + policy `tenant_id = current_setting('cvg.tenant_id', true)`.
- Papéis distintos: `cvg_migration_*` (DDL/backfill) e `cvg_runtime_*` (DML, `NOSUPERUSER NOCREATEDB NOCREATEROLE`, sem `BYPASSRLS`). Runtime não aplica migration; migration não executa envio.
- Contexto é limpo em `finally` e conexão destruída se a limpeza falhar (comportamento já provado em `withTenantContext`). Teste de reutilização de pool após erro é obrigatório em AAA-16.

## 12. Observabilidade e evidência de auditoria

- Transições → eventos de auditoria append-only com: `tenantId`, identidade da operação, `payloadHash`, estado anterior/novo, `correlationId`, `leaseOwner`, `attempt`, timestamp.
- Métricas: reservas por desfecho, replay, conflito, incerteza, leases expirados, takeovers, reconciliações pendentes. Nomes e exposição seguem `0113`; sem PII.
- `/ready` deve considerar o journal disponível quando ele for dependência crítica; `/live` permanece independente (task irmã de F06, não implementada aqui).

## 13. Critérios de aceite e validação adversarial

Aceite do JSON canônico: migration owner único; papéis runtime/migration e versão de contrato fixados; nenhuma troca silenciosa de API; plano de recuperação testável.

Validação exigida: walkthrough adversarial dos sete casos da auditoria `0558`, no mínimo:

1. payload aprovado diferente do executado (F01/F02) — fora do escopo deste contrato, referenciado para não conflitar;
2. aprovação consumida antes do sucesso — idem;
3. ferramenta repete no retry (F03) — identidade/hash definidos aqui sustentam a correção de AAA-10;
4. envio concorrente duplicado (F04) — porta e estados deste contrato sustentam AAA-12;
5. crash após efeito e antes do ack — matriz §7;
6. reuso de chave com payload divergente — §6;
7. resultado incerto — §5/§7.

## 14. Handoffs e próximos consumidores

- `AAA-10` (Agente 1): consome identidade/hash/estados como base do efeito durável; `packages/persistence/src/outbox.ts` e `postgres.ts` permanecem com ele.
- `AAA-12` (este owner): implementa a porta e o adapter durável local em `packages/channel-gateway/`; adapter SQL e migration ficam bloqueados por D05-1/D05-2.
- `AAA-16` (este owner): prova o contrato em PostgreSQL descartável, com foco em RLS/papéis/migrations/corrida.
- `AAA-17`: migração de jornadas depende de SPEC própria e não começa automaticamente.
- Reserva solicitada ao coordenador: próximo número de migration livre após `0011` e paths `packages/persistence/src/channel-effect-journal.ts` / `packages/persistence/migrations/00XX_channel_effect_journal.sql` **ou** decisão de que AAA-10 incorpora o journal ao ledger de efeitos existente.

## 15. Riscos e limitações declaradas

- Sem provider com idempotência/consulta, a janela `SENDING` é intrinsecamente incerta; o contrato não promete exactly-once.
- O adapter em arquivo é durável em host único e entre processos do mesmo host; **não** é compartilhado entre hosts e não substitui PostgreSQL.
- Números de retenção/TTL são provisórios até D05-3.
- Este contrato não corrige código; nenhuma garantia do runtime muda por sua publicação.
