# Revisão independente 0262 — fatias 3, 4 e 5 (D9, 29/10/2026)

Revisor: Claude D9 (Sonnet 5.5). Base revisada: `claude/aud0625-0257-07` @ `422d41f89`
(fatia 3 `fe3bede87`, fatia 4 `f8c55f6c6`, fatia 5 `422d41f89`), em cópia destacada
própria. Só dados sintéticos; PostgreSQL 16 em contêiner próprio (removido). Node 22.23.2.

## Veredito: APPROVE (um P2 e cinco P3 para o dono; nenhum bloqueia o merge)

O P2 está num script que hoje é inerte (sem política root, sem prova, lançamento positivo
NOT_RUN/T4); ele precisa ser corrigido antes de qualquer lançamento real.

## Verificado

- **Auth v2 forward-only** (`0002_principal_revision.sql`): coluna `principal_revision bigint NOT NULL
  DEFAULT 0` (default constante, sem reescrita) + CHECK 0..2^53-1; as três funções sem binding são
  removidas, sem overload nem alias; `create_v2/replace_v2` exigem revisão >= 1; `get_v2` filtra
  `principal_revision >= 1`, então toda linha legada (0) exige novo login; `replace_v2` só rotaciona
  com tenant/operador/role/revisão iguais (mudança = nova família). SECURITY DEFINER, `search_path`
  fixo, REVOKE PUBLIC; runner com checksum próprio e transação única; preflight pina colunas, CHECK,
  corpos e assinaturas; sonda de readiness em `get_v2`. Consequência aceita: binário antigo contra
  schema novo dá 503 (não há volta); vale registrar na nota de deploy.
- **Hook por request** (`operator-session-hook.ts`): cada request compara a revisão do cookie com o
  principal atual (dados, nunca a role Auth); 401 limpa o cookie; falha de leitura é 503 e mantém o
  cookie; sem `authorityVersion` é 503; nunca cai para "só a sessão". Probes e rotas de login OIDC
  continuam antes do hook. `/v1/session` com cookie velho e token válido segue para o handler.
- **Guard** (`operator-principal-guard.ts` / `operator-route-class.ts`): classificação fechada por
  método + template REGISTRADO; tudo que não está nomeado é `operator`; `onRoute` instalado antes
  das rotas; inventário em runtime. Usa o resolver memoizado do servidor (token de uso único
  consumido uma vez). Prova D9: varredura das 71 rotas `operator` do inventário (sem HEAD derivado)
  com token de principal inexistente e corpo inválido por Zod → **todas 401** (probe descartado após
  a execução). Corpo com JSON malformado dá 400 do parser antes do guard: é o que a SPEC §5 manda
  ("HTTP target/JSON parser ... continuam antes dele"), não é achado.
- **Script/lib** (`scripts/lib/operator-action.ts`): parser exato (sem flag desconhecida, duplicada,
  `--test`, `--force`, `--policy`); política e prova regulares, não symlink, uid 0, modo 0600, pais
  root e não graváveis por outros, tamanhos limitados, JSON estrito sem `__proto__`, chaves exatas;
  prova sob diretório 0700 root, nome = decisionId, estados autorizados fechados, bindings de tenant,
  operador, revisão, artefato e perfil do datastore, janela <= 30 min; perfil comparado antes de
  conectar e `current_database/current_user` depois; `UNKNOWN` sem repetir; saída sem URL/segredo.
- **Porta** `invalidateOperatorSessions`: principal `FOR UPDATE`, CAS por `expectedRevision`,
  incrementa só `revision`/`updated_at`, audit no mesmo client, só digests; conflito/ausente cria
  nada. Memória e PG.
- **Testes migrados**: ver P3-1/P3-2 (achatamento de 403 para 503, justificado pela SPEC §5, com
  cobertura de role em `case-assignment-authorization.test.ts`). Nenhuma asserção removida sem
  substituto exceto as duas notadas.
- **Gates (no tip 422d41f89)**: typecheck 0; focados 14 arquivos / 223 testes (guard, sessão, hook,
  identity-*, oidc-*, production-boundary, case-*, invalidação memória, `tests/operator-action*`);
  PG 9 arquivos / 89 testes (operator-session-postgres, production-bootstrap-postgres-own,
  oidc-login(-entrypoint)-postgres, runtime-approval-unit-postgres, trusted-replay-distributed,
  case-assignment/scope-postgres, case-mutation-unit-postgres); `skip:governance` PASS (43 entradas);
  nenhum arquivo do mutation-manifest foi tocado nas três fatias (`operator-identity.ts` intacto).

## Achados

### P2-1 — o lançamento real aceita atalhos que a SPEC proíbe: `PG*` do ambiente e query da URL
A SPEC (§6.1) diz "nenhum DATABASE_URL do shell escolhe outro alvo" e "perfil host/port/database/user
comparado antes de conectar". O script não lê `DATABASE_URL`, mas `connect()` entrega a URL a
`new Pool({connectionString})` e o `pg` completa o que faltar com variáveis do shell e com a query:

- `PGPASSWORD`, `PGSSLMODE` e **`PGOPTIONS`** (ex.: `-c search_path=...`) do shell entram na conexão;
- `?host=outro`, `?port=`, `?dbname=`, `?user=`, `?options=` na URL sobrescrevem a parte que o script
  comparou (`url.hostname` etc.), então o "perfil antes de conectar" pode ser contornado por um
  arquivo de conexão com query.

Prova: `proofs/probe-pg-env-and-query-override.cjs` (resolve `pg` do projeto; sem rede). Com as
variáveis exportadas, `Client` resolve `password`, `ssl` e `options` do ambiente e `host=other.example`
da query; com `fix`, apagar `PG*` do `process.env` elimina o ambiente mas NÃO a query (os dois são
necessários). A fronteira de confiança é o administrador root, então não é uma escalada por terceiros;
mas é exatamente a propriedade pedida ("não aceita atalho") e nenhum teste a trava (o CLI só prova
que `DATABASE_URL` é ignorado).
Correção sugerida: em `connect()` recusar `url.search`/`url.hash` não vazios; ler `PG*` apenas para
apagá-las (`for k of Object.keys(process.env) if k.startsWith('PG') delete`) antes de abrir o Pool;
passar `host/port/database/user/password/ssl` como campos explícitos (ssl conforme a política).
Teste RED: fixture de URL com `?host=`; processo com `PGPASSWORD`/`PGOPTIONS` e verificação do
`connectionParameters` resultante. Corrigir antes do T4 (lançamento positivo como root).

### P3-1 — `installedArtifactSha256` cobre só o arquivo de entrada
O digest é de `scripts/revoke-operator-sessions.ts`; a lógica de decisão (`scripts/lib/operator-action.ts`)
e a escrita (`@cvg/persistence`) ficam fora, então alterá-las não muda o digest. Para o T4, definir o
"artefato instalado" como um bundle único (ou digest da lista de arquivos) e provar o mismatch.

### P3-2 — `oidc-login-guards`: o 403 de Operator/Approver em `/v1/cases` virou 503
Mudança correta pela SPEC §5 (principal antes da matriz), mas essa expectativa deixou de existir nesse
arquivo. A matriz está coberta com principal real em `case-assignment-authorization.test.ts`; basta
anotar no teste de onde vem a cobertura.

### P3-3 — `case-scope-tasks-approvals` ("S6 principal policy"): ramo morto e matriz perdida
`const expected = 503` torna `if (expected === 503)` incondicional e `route.permitted` não é mais
consultado nesse caso. A metade "role fora de `permitted` = 403" dessas seis rotas não é mais
afirmada em nenhum lugar com autoridade configurada que eu tenha encontrado. Sugestão: companheiro
com autoridade configurada que afirme 403/não-503 por rota e role, e remover o `if`.

### P3-4 — perfil de produção HMAC sem OIDC dá 503 em toda rota de operador
Decisão do Ricardo (recibo human-decisions-12), não é achado. Registro apenas que
`production-bootstrap-postgres-own` e `production-boundary` passaram a montar o servidor sob
`NODE_ENV=test` com principais `verified_adapter`; o 503 do perfil real continua provado só pelos
testes de composição sem autoridade. Manter o ensaio via OIDC.

### P3-5 — `FileStat` não traz `nlink`
Um hardlink root:0600 para o arquivo de prova/política passa na verificação (o limite de confiança
continua sendo root). Barato de fechar: exigir `nlink === 1`.
