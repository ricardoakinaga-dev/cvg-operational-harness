# REM21-007 — SPEC — rate limiter HMAC/versionado

## Contrato de keyring

`RateLimitKeyRing` contém:

- `budgetSecret`: segredo namespace, com pelo menos 32 caracteres e estável
  durante uma rotação;
- `current: { keyId, secret }`: versão ativa;
- `previous[]`: versões históricas permitidas para rollout, com IDs distintos.

Cada segredo é validado contra placeholders e não é serializado em logs. O
ambiente usa `CVG_RATE_LIMIT_KEYRING` em JSON. O perfil `test` sem campo usa
somente uma chave sintética determinística para fixtures; `development` e
`production` exigem configuração explícita quando o caminho PostgreSQL é
composto.

Para uma chave normalizada `K`:

```text
budget_key = hex(HMAC-SHA256(budgetSecret, "cvg-rate-limit:budget:v1:" + K))
key_digest = hex(HMAC-SHA256(current.secret, "cvg-rate-limit:key:" + current.keyId + ":" + K))
key_version = current.keyId
```

O `budget_key` é a chave primária. Assim a rotação de `current` só atualiza a
projeção versionada e preserva `count`/`reset_at`. O `key_digest` não é usado
como lookup lógico e nunca contém o texto de `K`.

## Memória

`InMemoryRateLimiter` usa `budget_key` no `Map`. A cada check:

1. valida chave, política e relógio;
2. descarta buckets com `resetAt <= now`;
3. atualiza o bucket existente ou cria o corrente;
4. se não há bucket e todos os `maxBuckets` estão ativos, lança
   `RateLimitCapacityError` e não altera nenhum bucket ativo.

O snapshot continua limitado a cardinalidade e capacidade, sem expor IDs.

## PostgreSQL

Migration `0026_rate_limit_key_hardening.sql` é roll-forward após `0023`:

- limpa o estado efêmero antes de remover `key` plaintext;
- remove `key` e cria `budget_key`, `key_version`, `key_digest`;
- preserva `count`, `reset_at`, primary key/indexes e revoke de `PUBLIC`;
- adiciona checks de formato/contagem.

O upsert usa uma query parametrizada com `pg_advisory_xact_lock` em constante
operacional, `budget_key` como conflito e condição de capacidade que conta
somente `reset_at > now()`. Sem linha retornada significa store cheio de
budgets ativos e resulta em `RateLimitCapacityError`. A limpeza amostrada faz
somente:

```sql
DELETE FROM rate_limit_buckets WHERE reset_at <= now()
```

Não existe mais `ORDER BY reset_at ... DELETE` para desalojar bucket ativo.

## Composição e preflight

`buildServerFromEnv` deriva o keyring no perfil PostgreSQL e injeta-o no
limiter. `assertRateLimitSchema` exige `budget_key`, `key_version`,
`key_digest`, `count`, `reset_at`, os checks nomeados e o índice de expiração.
O catálogo de migrations passa a exigir `0026_rate_limit_key_hardening`.

## Verificação

Os testes negativos devem cobrir: plaintext nos valores SQL, capacidade cheia,
rotação com orçamento exaurido, criação de segunda instância, expiração por
janela, migração sem coluna antiga e keyring ausente/inválido fora do teste.
PostgreSQL descartável é obrigatório para qualquer prova de migration ou
concorrência; sem ele, o resultado permanece `FINAL_CERT_DEFERRED`.

## Gate

`SPEC_APPROVED_CONTROLLED_BUILD / BUILD_AUTHORIZED_LOCAL`.
