# SPEC-PR301-FENCE-001 — preflight semântico do fencing de webhook

- Trilha: **T3**, pois endurece um controle de integridade usado no boot da API.
- Task: `PR-301-FENCING-CONSTRAINT-PREFLIGHT`, registrada nos backlogs
  [0333](../03_build/0333_audit20_backlog.md) e
  [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Estado: `SPEC_READY_FOR_HUMAN_REVIEW`; BUILD exige revisão humana explícita.
- Ambiente: Node 22 e PostgreSQL 16 descartável, somente dados sintéticos.

## Recon e risco

O [I1 de AUD20-008](../04_audit/evidence/AUD20-008-I1-20260928/I1-review.md)
aprovou o fencing no candidato isolado `7ef74e7`, mas registrou P2: o
`assertWebhookReplaySchema` consulta `pg_constraint` apenas por namespace e
nome. Em PostgreSQL 16 descartável, a mesma consulta encontrou
`webhook_replay_events_fencing_check` em outra tabela após a remoção da
constraint original. Também encontrou a constraint de nome correto na tabela
correta quando ela foi substituída por `CHECK (true)`. Ambas as mutações
ocorreram dentro de uma transação com `ROLLBACK`; a migração 0025 íntegra
permaneceu intacta. [SQL, log e hashes da prova](../04_audit/evidence/PR301-FENCING-PREFLIGHT-SPEC-20260928/proof.json)
preservam as definições canônicas e os dois negativos. Portanto, a checagem
atual não prova o contrato que o serviço pressupõe. Os testes de comportamento de reserva/commit existentes
não exercitam essas derivações de catálogo no boot.

## Invariante de boot

O preflight da API deve falhar antes de servir tráfego quando qualquer parte
do contrato abaixo divergir da tabela ordinária `webhook_replay_events` no
schema ativo:

1. Resolver uma única tabela pelo OID no schema ativo. Exigir `relkind='r'`,
   `relpersistence='p'` (durável), sem herança ou partição como pai ou filho
   em `pg_inherits`, e sem RLS. `UNLOGGED`, filho/pai de herança e tabela
   com policy não são equivalentes ao armazenamento migrado.
2. Consultar `pg_attribute` e defaults da **mesma tabela** para as seis
   colunas: `event_key text NOT NULL`, `status text NOT NULL`,
   `expires_at timestamptz NOT NULL`, `created_at timestamptz NOT NULL
DEFAULT now()`, `lease_generation bigint NOT NULL DEFAULT 0` e
   `lease_token text NULL`. Conferir tipo por OID, `attnotnull`,
   `attisdropped=false` e defaults canônicos; nenhuma coluna obrigatória
   pode ser substituída por homônima de outra tabela. `created_at` é
   atualizado na retomada do lease; sua ausência ou deriva quebra esse fluxo.
3. As cinco constraints das migrations 0002/0025 pertencem **ao OID da
   tabela**. A PK tem `contype='p'`, `conkey` exatamente do atributo
   `event_key`, `condeferrable=false` e índice de suporte (`conindid`)
   primário, único, imediato, válido e pronto sobre a mesma relação.
   Isso preserva `ON CONFLICT (event_key) DO NOTHING`. As quatro CHECK têm
   `contype='c'`, `convalidated=true`, e as definições exatas abaixo.
   Ausência, duplicação ambígua, tipo errado, `NOT VALID` ou PK adiável
   falha fechado.
4. Usar como baseline as quatro formas canônicas de PostgreSQL **16.15**
   medidas no [espelho sintético](../04_audit/evidence/PR301-FENCING-PREFLIGHT-SPEC-20260928/probe.log)
   das migrations 0002/0025. O BUILD deve repetir a medição após **executar
   as migrations reais** no schema descartável e exigir igualdade:

   ```text
   CHECK (btrim(event_key) <> ''::text)
   CHECK (status = ANY (ARRAY['reserved'::text, 'committed'::text]))
   CHECK (lease_generation >= 0)
   CHECK (status = 'reserved'::text AND lease_generation > 0 AND lease_token IS NOT NULL AND btrim(lease_token) <> ''::text OR status = 'committed'::text AND lease_token IS NULL)
   ```

   Comparar `pg_get_constraintdef(oid, true)` em contexto de
   `search_path` determinístico com `pg_catalog` primeiro. Capturar o OID do
   schema alvo **antes** de mudar o `search_path`; depois consultar a tabela
   e os objetos somente por esse OID, pois `current_schema()` passaria a
   identificar `pg_catalog`. Tipos das colunas e objetos
   referidos pela expressão precisam ser os built-ins esperados; um nome
   reconstruído isolado não prova identidade de função/tipo. Não aceitar
   substring, nome ou regex genérica. Uma mudança legítima de migration ou
   versão principal do PostgreSQL exige atualizar contrato e testes sob
   revisão, mantendo recusa fechada durante a transição.

5. `idx_webhook_replay_events_expires` deve pertencer à tabela alvo,
   indexar apenas `expires_at` em btree, sem expressão/predicado, e estar
   válido e pronto. Rejeitar triggers de usuário e regras de reescrita
   associados à tabela que possam alterar `INSERT`, `UPDATE` ou `DELETE`;
   rejeitar FKs em que a tabela seja origem ou destino, inclusive quando
   a outra tabela está em outro schema. Consultar `pg_trigger`,
   `pg_rewrite` e `pg_constraint` por OID, não somente por schema da tabela.
   Essa restrição conserva o comportamento direto e durável esperado por
   `reserve/commit/release`.
6. O contrato é obrigatório no modo PostgreSQL servido com
   `POSTGRES_RLS_ENFORCEMENT=true`, incluindo produção e o teste público de
   boot. Preservar o fail-closed existente para configuração PostgreSQL
   sem esse modo, conforme o contrato de composição; não declarar que o
   preflight roda em um caminho que não o chama. Não alterar migration
   0025, semântica de `reserve/commit/release` nem API pública. Erro de
   catálogo, privilégio insuficiente ou resultado inesperado bloqueia o
   serving sem expor detalhes sensíveis.

## Negativos e critérios de aceite

- Positivo: migrations 0002/0025 em schema descartável, preflight PASS e
  `reserve/commit/release` funcionais. Medir catálogo, defaults, PK, índice
  e quatro CHECKs em PostgreSQL 16.15; repetir com `search_path` fixado.
- Negativos PostgreSQL reais e independentes: remover a constraint de
  fencing e criar homônima em outra tabela; trocar a de fencing por
  `CHECK (true)` na tabela correta; trocar a de geração por permissiva;
  marcar uma CHECK como `NOT VALID`; alterar status/event key; retirar
  `NOT NULL` ou default de `created_at`/`lease_generation`; mudar tipo de
  coluna; recriar PK `DEFERRABLE`; criar tabela `UNLOGGED` e herança; criar
  índice homônimo em outra relação ou índice inválido; criar trigger ou
  regra que suprima mutação; adicionar FK referenciando a tabela desde
  outro schema. Demonstrar cada mutação com catálogo e recusa do
  **preflight público** antes de serving, com
  `POSTGRES_RLS_ENFORCEMENT=true`. Um negativo de trigger/regra/FK deve
  demonstrar alteração observável da reserva ou do commit antes da
  correção, sem permitir que o teste destrua dados de outro caso. Reverter
  cada caso com transação/rollback ou schema descartável e inventário de
  limpeza sem resíduos.
- Testes unitários de catálogo representam OID, tipo/default/nulabilidade,
  `contype`, `conkey`, `condeferrable`, `convalidated`, definição,
  índice, herança, triggers/regras e FKs; resposta incompleta falha.
  Não usar apenas mocks que espelhem a nova implementação.
- Após BUILD aprovado: teste focado, `typecheck`, lint, `npm test`,
  `test:postgres` e E2E em Node 22/PostgreSQL 16, crítica independente do
  diff e nova certificação **apenas no SHA final integrado** sob claim
  exclusivo. Qualquer falha mantém `NO_GO`.

## Limites e rollback

O contrato é de preflight, não corrige automaticamente um schema já
degradado. Se o boot falhar após implantação, reverter o artefato de código
e restaurar as migrations corretas segundo o procedimento de migração;
nenhuma DDL é executada pelo preflight. O I1 do candidato isolado não fecha
sozinho o finding `A21-F20` do registro de certificação. CI remoto,
atestação externa, IAM/staging, certificado do SHA final e decisão humana
de release continuam pendentes; produção `NO_GO`.

## Revisão técnica

Crítica independente Lagrange, 28/09/2026: primeira rodada `REJECT`, com
quatro P1 (colunas/default, PK adiável/índice, tabela não durável/herança e
objetos que alteram DML) e três P2 (índice de expiração, forma canônica e
alcance do boot). O contrato acima foi revisto para cobrir cada ponto. I2
`ACCEPT_SPEC_REVIEW_READY`, sem P0/P1 restante, apontou que o probe era
um espelho sintético e que o OID do schema precisa ser capturado antes de
fixar o `search_path`; ambos foram explicitados. Revisão humana T3 e BUILD
continuam pendentes.
