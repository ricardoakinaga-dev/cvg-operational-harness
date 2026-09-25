# REM21-007 — DISCOVERY — chaves e budgets do rate limiter

## Contexto e gate

- task: `REM21-007` / achado `A21-F10`;
- origem histórica: parte de `AUD20-009`;
- autorização: `G21-1`, somente local, sintética e descartável;
- ambiente: Node `v22.23.2`; produção permanece `NO_GO`;
- dependências: `REM21-002` concluída localmente; nenhuma credencial, rede
  externa, provider, canal ou dado real é necessário.

## Reprodução do achado

O caminho atual em `apps/api/src/rate-limit.ts` normaliza a entrada, mas usa a
própria string como chave do `Map` e como valor de `$1` no PostgreSQL. A
migration `0023_rate_limit_buckets.sql` cria `key text PRIMARY KEY`, portanto
uma chamada como `ip:203.0.113.10` pode chegar ao banco em claro. O middleware
constrói exatamente `ip:${request.ip}`.

Quando o mapa em memória atinge `maxBuckets`, `evictEarliestReset` remove um
bucket ainda ativo. O `PostgresRateLimiter` faz o mesmo por SQL, ordenando por
`reset_at` sem excluir linhas ativas. Um novo key após churn pode então iniciar
um orçamento novo antes da janela anterior terminar.

## Invariantes descobertos

1. A identidade lógica do budget precisa ser a mesma em todas as instâncias e
   sobreviver a reinício e rotação da chave de pseudonimização.
2. Nenhum key operacional bruto pode ser persistido ou incluído em SQL,
   snapshot ou log operacional.
3. A janela é fixa: somente `reset_at <= now()` pode liberar um bucket.
4. Capacidade cheia com budgets ativos deve falhar fechado para um novo key;
   não pode desalojar um budget ativo.
5. A atualização do budget deve permanecer atômica entre processos e o
   histórico de versões da chave não pode criar uma segunda linha para o
   mesmo subject lógico.

## Decisão de descoberta

Adotar duas projeções HMAC da chave normalizada:

- `budget_key`: HMAC com um segredo de namespace estável durante a rotação;
  é a identidade lógica e a chave primária do bucket;
- `key_digest`: HMAC com a chave versionada ativa; junto de `key_version`,
  permite verificar qual versão pseudonimizou a última operação e atualizar
  esse valor sem resetar `count`/`reset_at`.

O segredo de namespace é deliberadamente separado do segredo versionado. A
rotação troca `key_version`/`key_digest`, mas mantém `budget_key`; uma rotação
de namespace é uma mudança de identidade e exige migração explícita, não pode
ser inferida como rotação normal.

Para PostgreSQL, a capacidade é protegida por advisory lock operacional
constante e por uma inserção condicional que conta somente buckets ativos.
Quando a capacidade está cheia, o store retorna erro de capacidade; a camada
HTTP aplica o envelope `429` já existente. A limpeza remove apenas buckets
expirados e nunca faz eviction de linha ativa.

## Gate

`DISCOVERY_COMPLETE / PRD_SPEC_AUTHORIZED_CONTROLLED_BUILD`.
