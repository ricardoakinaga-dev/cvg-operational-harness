# SPEC 0271 — O pré-check da migration 0021 só conta o que o índice deduplica

R1, 29/10/2026. Task `AUD0625-F15-D9-20261029`, achado F15 da
[auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md); o
rascunho de discovery (R0) é da sessão 07 e a dona é a sessão DF. Estado
`PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: migration e contrato de checksums. **Sem
BUILD até revisão humana explícita deste documento.**

## 1. Evidência atual

Base: `claude/aud0625-wave3` @ `f38bfafc4`.

- `migrations/0021_approval_decision_audit_dedupe.sql` conta, antes de criar o
  índice, grupos de `type = 'approval_decision'` por
  `COALESCE(tenant_id,''), payload->>'approvalId', payload->>'decision'` com
  `COUNT(*) > 1` e aborta com `23505`.
- O índice `uq_audit_approval_decision` usa as mesmas três expressões, com
  `WHERE type = 'approval_decision'`. No PostgreSQL um índice único trata `NULL`
  como distinto: uma linha com `approvalId` ou `decision` nulo **nunca** viola
  o índice. O `GROUP BY` do pré-check, ao contrário, agrupa os `NULL` juntos.
- `attendanceDecisionAudit` (`attendance-approval.ts`) grava eventos
  `approval_decision` (quando o estado não é `assumed`, que vira `handoff`) com
  `approvalRequestId`/`status` e **sem** `approvalId`/`decision`. Cada um tem
  chave `(tenant, NULL, NULL)`.
- Prova em PostgreSQL 16, contêiner próprio
  (`AUD0625-F15-SPEC-D9-20261029/red-on-base.txt`), migrations 0000–0020
  aplicadas, histórico misto (3 decisões do harness e 2 eventos de atendimento
  por tenant, 2 tenants) e a 0021 em seguida: **aborta** com
  `AUD20-006: legacy duplicate approval_decision key groups prevent unique index
creation (2 groups)`, os grupos `(tenantA, NULL, NULL)` e
  `(tenantB, NULL, NULL)`. Controles que passam hoje: só decisões do harness; um
  evento de atendimento por tenant; o próprio índice aceita 4 eventos
  `NULL/NULL` depois de criado (o pré-check é mais estrito que o índice); uma
  duplicata real continua bloqueando, mesmo com eventos de atendimento
  presentes.
- Quem é afetado: só bancos em que a 0021 **ainda não foi aplicada** e que já
  têm dois ou mais eventos de atendimento do mesmo tenant. A produção é
  instalação nova (a 0021 roda sobre `audit_events` vazia): o defeito está
  dormente lá. Bancos de homologação e ensaio que acumularam eventos antes da
  0021 ficam parados na 0021 e, como o `runPostgresMigrations` aplica a lista
  em ordem e para no primeiro erro, **todas as migrations seguintes (0022–0031)
  também ficam bloqueadas** para eles.

## 2. Por que uma "migration de guarda" não resolve

O runner aplica a lista de migrations em ordem e aborta na primeira falha. Uma
migration nova, nomeada depois da 0021 ou inserida antes dela, não corrige o
pré-check da 0021: este roda sobre os mesmos dados e aborta primeiro; uma
migration anterior não pode apagar nem reescrever eventos de auditoria (são o
registro). Criar o índice antes não ajuda, porque o pré-check roda antes do
`CREATE UNIQUE INDEX IF NOT EXISTS`. A única correção é mudar o pré-check
executado na 0021.

## 3. Mudança proposta

### 3.1 Pré-check alinhado ao índice

No `SELECT COUNT(*)` da 0021, acrescentar ao `WHERE`:
`AND payload->>'approvalId' IS NOT NULL AND payload->>'decision' IS NOT NULL`.
Fica contado exatamente o que o índice pode rejeitar. Duplicata real continua
bloqueando (mesmos grupos de antes, só sem os `NULL`). O índice, a validação de
definição e a mensagem não mudam.

### 3.2 O arquivo 0021 muda e o checksum precisa seguir

O runner e o `assertTenantIsolationMigrationState` comparam o sha256 do arquivo
com o `schema_migrations.checksum`; qualquer divergência é erro. Editar a 0021
quebraria **todo banco onde ela já foi aplicada** (CI, homologação, ensaio).
Por isso:

- O código passa a conhecer os checksums anteriores aceitos de uma migration:
  `supersededMigrationChecksums = { '0021_approval_decision_audit_dedupe':
['038de370b42478ee8987109c4d799ce15bf00d93cba973f19d189c244cadeb7e'] }`
  (sha256 do arquivo atual). Uma versão aplicada é aceita se o checksum gravado
  for o atual **ou** um da lista. Nada é regravado: o banco que aplicou a versão
  antiga continua com o checksum antigo, sem escrita nem efeito colateral.
- A regra fica num ponto só, exportado de `@cvg/persistence`, e é usada pelo
  runner (`runPostgresMigrations`), pelo `assertTenantIsolationMigrationState`
  e por `baselineLegacyPostgresMigration` (que também compara checksums).
- Qualquer outro checksum continua sendo erro (`checksum mismatch`).
- Isso é _forward-only_: nenhuma migration aplicada é reescrita no banco; só o
  texto ainda não aplicado muda, e o efeito (o índice) é idêntico nas duas
  versões.

### 3.3 O que não entra

- Não se cria chave de dedupe própria para eventos de atendimento
  (`approvalRequestId`/`status`): é decisão de produto/dados à parte (D2).
- Não se reconcilia nenhuma duplicata legada real: segue bloqueando, como a
  0021 já documenta.

## 4. Critérios de pronto

- O `it.fails` de `aud0625-f15-migration-0021-precheck.test.ts` vira `it`:
  histórico misto, 0021 aplica e o índice existe.
- Os 4 controles seguem verdes (inclusive a duplicata real bloqueando com
  eventos de atendimento presentes).
- Testes novos de checksum: um banco que aplicou a 0021 **antiga** (arquivo do
  `git show f38bfafc4`) passa no runner e no preflight com o arquivo novo; um
  checksum desconhecido continua dando `checksum mismatch`; banco com 0021 nova
  passa. Teste de contrato: a lista de checksums aceitos só contém versões
  listadas e o arquivo atual nunca está nela.
- Teste de ordem: banco parado na 0021 pelo defeito passa a aplicar a 0021 e
  depois 0022–0031 numa execução.
- Mutações: sem o filtro `IS NOT NULL` no `approvalId`; sem o filtro no
  `decision`; filtro só num dos dois; lista de checksums aceitos vazia (banco
  antigo quebra); lista aceitando qualquer checksum (desconhecido passa);
  preflight sem a lista; `baseline` sem a lista.
- Campanha PostgreSQL de `approval-decision-atomicity-postgres`,
  `audit-decision-dedupe`, `postgres-persistence-mode` e
  `tenant-schema-inventory-postgres`; skip-catalog religado no mesmo commit
  (regra SPEC 0138) se um teste PG catalogado mudar.
- Typecheck, eslint, prettier, `docs:check-links`.

## 5. Testes

Os já escritos na fase 1 (`aud0625-f15-migration-0021-precheck.test.ts`: 1
`it.fails` e 4 controles, PG). No BUILD: os de checksum e de ordem acima, em
`packages/persistence` e `apps/api` (preflight).

## 6. Fora de escopo e limites aceitos

- Eventos de atendimento sem chave de dedupe própria continuam sem garantia de
  exatamente-uma-vez no banco (só a aplicação os trata); ver D2.
- Bancos com duplicata real legada continuam bloqueados por desenho.
- Dado real não é usado; o ensaio é sintético.

## 7. Decisões pedidas ao Ricardo

- **D1.** Como corrigir. Opções: (A) alinhar o pré-check na própria 0021 e
  aceitar o checksum antigo (§3.1 e §3.2); recomendado, pois é a única que
  desbloqueia os bancos parados na 0021 e não quebra os que já a aplicaram;
  (B) não mudar código e documentar um procedimento manual para bancos
  parados (apagar nada; o operador aplica o SQL corrigido à mão e registra o
  checksum), aceitando o risco de erro humano; (C) não fazer nada agora porque
  a produção é instalação nova, e reabrir se houver banco parado.
- **D2.** Os eventos de atendimento ganham chave de dedupe própria? Recomendado:
  não nesta SPEC (fica como acompanhamento com dono, junto da decisão de
  produto sobre exatamente-uma-vez de atendimento).
