# Crítica independente da SPEC0254 r2 — UP91-025 (fatia A)

- SPEC: `docs/02_spec/0254_oidc_login_case_principals.md`, r2, sha256 `3c804dc22c34b736b6d0c6bb5d683b6144a1d7d34dd083d33926d34afef49694`. Conferi o hash antes e depois da revisão.
- Lidos: [correções da r1](../spec-review-r1/corrections.md), [decisões de 22/10](../user-decisions-20261022.json) e [revisão r1](../spec-review-r1/review.md).
- Base: worktree `/mnt/dados/cvg-work/cvg-d9ef-up91025-20261022`, em `d9c84df9e`.
- Escopo: só leitura do código. Não rodei PG, testes do repositório, lockfile nem commit.
- Crítico: Claude Code, o mesmo da r1, em contexto separado do executor.
- Data: 22/10/2026.

## Veredito: `APPROVE`

- **M1–M4 da r1:** fechados.
  - O M1 foi conferido rodando a chamada exatamente como a §4.2 da r2 descreve.
- **Decisões P1–P7:** aplicadas sem contradição.
- **Tabela do produtor:** cobre todos os casos e é coerente com a SPEC0176 `:52`, na leitura explícita da P4.
- **Checagem de boot da P5:** correta e sem estado novo.
- **Mutantes M23–M29:** morrem com as provas citadas. O M29 só morre de forma parcial (opcional R2-O4).
- **Três desvios do executor:** aceitos (§ "Desvios").
- **Regressões:** a r2 não introduz nenhuma que leve a falha de segurança, prova falsa, contradição com SPEC aprovada ou BUILD impossível.
- **Opcionais:** os sete abaixo são melhorias; nenhum bloqueia o BUILD.

## Obrigatórios da r1

### M1 — fechado

- **Onde a r2 corrigiu:**
  - a §4.2 inclui `execute: [enableNonRepudiationChecks]`, sem `allowInsecureRequests`;
  - o I1 cita a assinatura verificada;
  - o texto do JWKS foi corrigido (`:138`);
  - entrou o mutante M23;
  - o O5 cobre "outra chave com `kid` conhecido" e "`kid` desconhecido";
  - o O12 recusa `allowInsecureRequests`.
- **Prova.** O script `check-sig-r2.mjs` reproduz a §4.2 da r2:
  - `discovery` com `ClientSecretBasic`, `id_token_signed_response_alg: 'RS256'`, `execute: [enableNonRepudiationChecks]`, `timeout: 5` e `customFetch` como invólucro D12;
  - `authorizationCodeGrant` com `pkceCodeVerifier`, `expectedNonce`, `expectedState`, `idTokenExpected: true` e `maxAge: 300`.
- **Resultado:**
  - chave correta → aceito, com uma chamada a `token` e uma a `jwks` (bate com o O3);
  - outra chave com `kid` conhecido → `OAUTH_INVALID_RESPONSE`, classificado 401;
  - `kid` desconhecido → `OAUTH_KEY_SELECTION_FAILED`, classificado 401.
- **Rotação de chave:** a mesma `Configuration` recusa o `kid` novo dentro de 60 s; uma `Configuration` nova aceita. Bate com a §4.10 e o O5.

### M2 — fechado

- **M13:** morre pelo replay com zero chamadas novas a `token` (O5). Com o mutante, a troca acontece antes do consumo e conta uma chamada.
- **M24:** é novo e morre pela sequência "state divergente → 401; mesmo code com o state certo → 303". No código atual, o state divergente é recusado antes do consumo (`oidc-login-transaction.ts:150-163` antes de `:169-175`). Com o mutante, o code é queimado no primeiro pedido, e o segundo dá 401.
- **M19:** morre pelo issuer que só difere na normalização (O2). A r1 mostrou que a biblioteca aceita esse issuer (`check-issuer.mjs`).
- **M3 e M14:** as citações foram corrigidas.

### M3 — fechado

- O I9 (`:80`), o O11 (`:358`) e o aceite 13 isentam só a `authorizationUrl` da resposta 200 do start.
- O O11 passou a cobrir o 303, os 401/503 e o audit.

### M4 — fechado

- O I5 e a §4.1 (`:102-103`) exigem RLS e `DATABASE_MIGRATION_URL` com papel distinto no modo OIDC de teste.
- A §4.8, passo 2 (`:255`), mantém a recusa de `production-bootstrap.ts:52-56` só em `production`. Isso bate com a SPEC0144 `:54`.
- O ambiente de O6 (PG), O9 e O10 está declarado (`:336-344`).
- Conferi o harness citado:
  - `production-bootstrap-postgres-own.test.ts:59-130` cria os papéis, os schemas e os grants;
  - as linhas `:131-137` são o `stubEnv` de produção, que a r2 exclui.
- `parseEnv` aceita `DATABASE_MIGRATION_URL` (`packages/shared/src/env.ts:31`).

## Decisões aplicadas

### Tabela do produtor (§4.5)

A tabela vale na ordem das linhas. Ela cobre todas as combinações de P × entrada:

- **P ausente:** linhas 1 e 2.
- **Np > N, ou Np = N com Dp ≠ D:** linha 3, para qualquer entrada.
- **Entrada inativa:** linhas 4 e 5.
- **Entrada ativa e P inativo:**
  - com Np = N, linha 6;
  - com Np < N, linha 7.
- **Entrada ativa e P ativo:**
  - com Np < N, ou com origem sintética, linha 7;
  - corrente, linha 8;
  - com a role diferente, linha 9.

O padrão `^oidc-v([1-9][0-9]{0,8})-([0-9a-f]{64})$` é canônico. Por isso, Np = N com Dp = D equivale a `authorityVersion === V`, e a linha 8 coincide com a checagem de `case-routes.ts:116-130`.

Conferi as linhas pedidas pelo coordenador:

- **Linha 3 (P5).** Fica acima da linha 4. Por isso, num rollback com entrada inativa, o login não desativa. Isso é inofensivo:
  - o principal com Np > N já não é corrente;
  - o `authorityVersion` difere de V, então ele já recebe 401 nas rotas de caso (`case-routes.ts:120`).
- **Linha 4 (P4).** Desativa com a mesma N, como a decisão manda. O `UPDATE` com `FOR UPDATE` (`case-authority-postgres.ts:709-753`) serializa com o `FOR SHARE` de um grant `ACTIVE` concorrente (`:1352-1371`). Assim, nenhum grant novo nasce contra um principal desativado.
- **Linha 7.** Reativa ou troca a role só com N maior, ou com uma fixture de teste.
  - Nos deploys graduais, um processo antigo (N=3) recusa pela linha 3 o principal já em N=4.
  - Na r1, os dois processos alternavam o principal entre as versões.
- **Linha 9.** Aplica a P3 de forma literal.

**Leitura da SPEC0176 `:52` (P4, `:204`).** A SPEC0254 diz: "sob a mesma versão, o login só tira acesso; dar acesso só na linha 1 ou com N maior". Isso é consistente com as linhas 4, 6 e 9 e com o registro da decisão. A SPEC0176 não muda.

**P5 com `authorityVersion = oidc-v<N>-<D>`.**

- O tamanho máximo é 80 caracteres. Cabe em `case-authority.ts:332` (até 120) e no CHECK de `0029` (`char_length` de 1 a 120).
- O D inclui N, porque a matriz tem `version`. Não há problema: a checagem de boot só compara principais com o mesmo prefixo.
- As `entries` são ordenadas antes do digest. O O2 prova que a ordem das entradas não muda a versão.

### Checagem de boot (§4.8, passo 6, `hasPrincipalVersionMismatch`)

- **Prefixo.** O hífen final de `"oidc-v" + N + "-"` evita colisão entre `v3` e `v30`. O `left(...) = $2` não usa coringa de `LIKE`.
- **Escopo.**
  - Lê `case_principals` sob a RLS do tenant, com `tenant_id = $1`.
  - O papel runtime já tem `SELECT` nessa tabela.
  - Ignora principais de fixture, cujo prefixo é diferente.
  - Inclui principais inativos, o que está certo: uma edição sem subir N também bloqueia.
- **Rollback.** Com N=2, o prefixo `oidc-v2-` não casa com principais em v4. O boot sobe e a linha 3 recusa, como o O9 prova.
- **Concorrência entre réplicas com o mesmo N e D diferente.** A checagem só pega o problema se já houver um principal gravado com a versão antiga. Fora disso, a linha 3 recusa logins cruzados: o resultado é uma recusa, nunca mais privilégio. A SPEC registra isso em `:206`.
- **Resíduos registrados** (`:314`):
  - Tenant retirado da matriz: os principais dele não são examinados. Mas também não conseguem logar, porque não têm grupo elegível.
  - Edição feita antes de qualquer login com aquele N: nada há a proteger.

## Mutantes novos M23–M29

| Mutante                                                    | Prova citada                                                                                                    | Morre?                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| M23 sem `enableNonRepudiationChecks`                       | O5: assinatura e `kid`                                                                                          | sim; a r1 mediu `accepted: true` sem a extensão                 |
| M24 troca antes de validar o state                         | O5: sequência e zero chamadas                                                                                   | sim                                                             |
| M25 boot sem checagem de versão                            | O9: N=3 editado sobe                                                                                            | sim (O9 via `buildServerFromEnv`, conforme a §6)                |
| M26 ordem por diferença                                    | O6/O9: rollback sem escrita                                                                                     | sim (o O6 afirma revisão e audit iguais)                        |
| M27 erro de transporte vira 401                            | O5: token 500, JWKS 500 ou fora → 503                                                                           | sim; `check-sig-r2.mjs` mede 503 para os três com o invólucro    |
| M28 tokenizador do CSRF mais estrito                       | O8: espaços e array                                                                                             | sim; sem o 403, a requisição segue até o 401 e a asserção falha |
| M29 `claim` em `__proto__`, `constructor` ou `prototype`   | O1                                                                                                              | **parcial:** o O1 só lista `__proto__` (R2-O4)                  |

## Desvios do executor

1. **`Object.hasOwn` sem mutante próprio — aceito.**
   - A justificativa das correções está errada. Ela diz que "um mutante de leitura não teria como ser morto", mas tem como, por poluição de protótipo.
   - Os claims vêm de `JSON.parse`, e o protótipo deles é `Object.prototype` (`check-sig-r2.mjs`: `protoIsObject: true`).
   - Defini `Object.prototype.synthetic_groups = ['synthetic-a-supervisor']` e li o claim. Leitura direta: devolveu o array. `Object.hasOwn`: devolveu `false`.
   - Saída mínima (R2-O1): um teste que polui o protótipo com o nome do claim (`configurable`, removido em `finally`), com um token sem o claim → 401 `groups_invalid`. Registrar como M30, ou ao menos corrigir a frase das correções.
2. **Checagem de boot amplia o conjunto de escrita para `packages/persistence` — aceito.**
   - É um método só de leitura, sem schema, tabela ou grant.
   - Só há dois implementadores de `CaseReadSnapshot`: memória em `case-authority.ts:699` e PG em `case-authority-postgres.ts:801`. Nenhum teste tem fake dessa interface.
   - O custo é baixo, e a alternativa do lead (tirar o passo 6) deixaria a P5 só com a linha 3.
   - O claim do BUILD tem de cobrir esses caminhos.
3. **Digest mantido como sufixo da versão — aceito.**
   - A ordem vem só de N (§4.5, passo 2; linha 3; prefixo do boot).
   - O sufixo é o único jeito de detectar uma edição sem subir N sem criar estado novo, como a própria decisão do lead pede.
   - A rota de caso compara a string inteira. Um principal com D antigo recebe 401 se escapar da checagem de boot.

## Opcionais (não bloqueiam)

- **R2-O1 — Mutante e teste para `Object.hasOwn`.** Ver o desvio 1.
- **R2-O2 — Marcação de indisponível por chamada, no invólucro D12.**
  - Fazer a marcação por chamada, com `AsyncLocalStorage` ou equivalente, e não com uma flag do módulo.
  - A `Configuration` e o `customFetch` são compartilhados entre callbacks concorrentes.
  - `check-sig-r2.mjs` mostra que, com `AsyncLocalStorage`, duas chamadas simultâneas mantêm cada uma a sua classificação: token 500 → 503 e assinatura estranha → 401.
  - Uma flag global trocaria 401 e 503 entre os callbacks. Não daria privilégio, mas deixaria o O5 e o M27 instáveis em paralelo.
- **R2-O3 — Casos "JWKS 500" e "JWKS fora" do O5 pedem app ou `Configuration` nova.**
  - Depois do primeiro login, o JWKS fica em cache por até 300 s e nem é buscado de novo.
  - No script, o 503 só apareceu com uma configuração nova.
  - O motivo é o mesmo da rotação de chave (§4.10).
- **R2-O4 — O O1 deve testar `constructor` e `prototype`, além de `__proto__`.** Sem isso, um mutante que exclui só `__proto__` sobrevive ao M29.
- **R2-O5 — Ordenar `requiredAmr` antes do digest, como as `entries`.**
  - Hoje, trocar a ordem dos valores muda D. O boot recusa com "matriz alterada" sem que nada tenha mudado de fato.
  - Isso falha fechado; o custo é só operacional.
- **R2-O6 — Comunicação ao usuário sobre a P4.**
  - A decisão registra "corta as sessões abertas".
  - A SPEC, com razão, limita o corte às rotas de caso, incluindo tasks e approvals pela SPEC0251 (`:204`, `:217`).
  - As demais rotas aceitam a sessão até expirar, em até 15 min (resíduo da UP91-026, `:312`).
  - O lead deve confirmar que o usuário entendeu esse limite.
- **R2-O7 — Tratar 429 do token endpoint como indisponível (503).** Hoje um 429 do IdP vira 401. É de baixa prioridade.

## Premissas

- **P1–P4:** decididas pelo usuário em 22/10 e aplicadas.
  - P1: §4.2 e §11.
  - P2: §4.4.
  - P3: linha 9.
  - P4: linha 4 e o parágrafo `:204`.
- **P5–P7:** decididas pelo lead e aplicadas.
  - P5: I12, §4.1, linhas 3 e 7, passo 6.
  - P6: I5, §4.1 e §7.
  - P7: §5 e §11.
- **Não achei premissa nova escondida.**
  - A ressalva sobre o alcance do corte da P4 ficou nos opcionais (R2-O6).
  - A D12 (classificação 401/503) é um default técnico seguro: os dois códigos negam o acesso.

## O que conferi (comandos)

```
sha256sum docs/02_spec/0254_oidc_login_case_principals.md   # 3c804dc2…9694, antes e depois
cat spec-review-r1/corrections.md user-decisions-20261022.json spec-r2.json
leitura integral da SPEC r2 (469 linhas)
sed -n 55,140p apps/api/src/__tests__/production-bootstrap-postgres-own.test.ts
grep -rn CaseReadSnapshot apps packages            # 2 implementadores, sem fakes
sed case-authority-postgres.ts (1352-1371)          # FOR SHARE do alvo do grant
grep DATABASE_MIGRATION_URL packages/shared/src/env.ts
env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin node check-sig-r2.mjs
env -i … node -e '<poluição de protótipo vs Object.hasOwn>'
```

Saída de `check-sig-r2.mjs`. As bibliotecas são `openid-client` 6.8.8, `oauth4webapi` 3.8.8 e `jose` 6.2.12, extraídas do cache npm para o scratchpad. O transporte é em memória, com o invólucro D12 por `AsyncLocalStorage`, e os dados são só sintéticos.

```
good: 303, calls token 1 / jwks 1, protoIsObject true
evilKnownKid: 401 OAUTH_INVALID_RESPONSE
evilUnknownKid: 401 OAUTH_KEY_SELECTION_FAILED
token400: 401 OAUTH_RESPONSE_BODY_ERROR
token500: 503 OAUTH_RESPONSE_IS_NOT_CONFORM
jwks500FreshConfig: 503 OAUTH_RESPONSE_IS_NOT_CONFORM
jwksDownFreshConfig: 503 TypeError
rotationSameConfig: 401 OAUTH_KEY_SELECTION_FAILED
rotationNewConfig: 303
concurrent: a (token 500) 503 / b (assinatura estranha) 401
```

Saída da poluição de protótipo:

```
direct read: [ 'synthetic-a-supervisor' ] | Object.hasOwn: false
```

Os scripts ficaram só no scratchpad da sessão. No repositório, escrevi apenas nesta pasta.

## Próximo passo

- O BUILD pode começar depois do registro deste `APPROVE` e do claim próprio sobre `server.ts`, o lockfile e os caminhos de `packages/persistence`.
- Os opcionais R2-O1 a R2-O7 podem entrar no próprio BUILD, sem nova rodada de SPEC.
