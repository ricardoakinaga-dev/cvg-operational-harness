# SPEC-PR301/402-001 — retenção e purga da autenticação OIDC

- Trilha: **T3**, pois altera o schema de autenticação, privilégios e o
  comportamento de eliminação.
- Estado: `PROPOSED_FOR_SPEC_REVIEW / DPO_POLICY_PENDING`. Esta proposta não
  autoriza BUILD, dado real, execução de purge nem produção.
- Revisão independente I24: `ACCEPT_SPEC_REVIEW_READY` após correções de
  cardinalidade/domínio da política e do risco de família prolongada. O
  crítico não executou banco nem autorizou BUILD.
- Revisão independente I25 do rollout: `ACCEPT_SPEC_REVIEW_READY` após fechar
  leitura da policy sem `SELECT` direto, comparação antes do `DELETE`, lock
  e isolamento contra snapshot antigo. A observação P2 de redação foi
  corrigida. Também não autoriza BUILD.
- Tasks: PR-301 e PR-402 no [backlog de produção](../03_build/0356_production_backlog_2026-09-26.md).
- Base: [SPEC 0144 aprovada](0144_trusted_operator_session_production.md),
  [inventário DB-09](../platform/09-personal-data-inventory.md),
  [sessões](../../packages/persistence/migrations/operator-session/0000_auth.sql)
  e [state OIDC](../../packages/persistence/migrations/operator-session/0001_oidc_state.sql).

## Recon e risco

`oidc_login_states` guarda somente o digest do `state`, mas reservas não
consumidas permanecem após os cinco minutos de validade. `operator_sessions`
guarda digest do cookie, tenant, operador, papel e horários; o lookup deixa de
aceitar a linha após expiração ou revogação, mas nenhuma operação a elimina.
`operator_session_families` vincula todas as sessões de uma linhagem. O logout
com um cookie antigo encontra a família por uma linha antiga; apagar essa linha
enquanto uma sucessora puder estar ativa quebraria a revogação da linhagem.
Esses digests e IDs são potencialmente vinculáveis a uma pessoa por outros
registros, mesmo sem token ou nome legível no banco. A API não deve ganhar
`DELETE` direto nem credencial DDL para resolver o acúmulo.

A [SPEC 0144](0144_trusted_operator_session_production.md) prevê job separado,
no máximo 1.000 linhas a cada dez minutos e alerta para backlog acima de
100 mil. A retenção após expiração, o descarte em backups e o procedimento de
direitos do titular ainda dependem de decisão do controlador/DPO. Não há
prazo presumido por esta SPEC.

## Decisões necessárias antes do BUILD T3

| ID    | Decisão do controlador/DPO                                                                                                                | Consequência técnica                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| DP-01 | `R_state`: duração de guarda após `oidc_login_states.expires_at`, em segundos, inclusive se zero.                                         | Cutoff do state e alarme de atraso.                                                                                                                   |
| DP-02 | `R_session`: duração de guarda após o **último** `expires_at` da família, em segundos, inclusive se zero.                                 | Cutoff indivisível da linhagem para preservar revogação por cookie antigo.                                                                            |
| DP-03 | Política única da plataforma ou prazo por tenant/produto.                                                                                 | A tabela de state não tem tenant; política por tenant requer redesenho e nova revisão desta SPEC.                                                     |
| DP-04 | Guarda de backups/PITR, prazo de reexpurgo após restauração e tratamento de solicitações de eliminação.                                   | Runbook e prova de restauração; exclusão da tabela ativa não prova exclusão do backup.                                                                |
| DP-05 | Finalidade e necessidade de manter linhas revogadas até o último vencimento, além de responsável pela revisão periódica.                  | Aprovação do RIPD/registro de tratamento e da política versionada.                                                                                    |
| DP-06 | Idade máxima da família enquanto reautenticações sucessivas a mantêm ativa, ou aceitação explícita de retenção potencialmente sem limite. | Um limite finito exige novo contrato de troca de família com MFA; sem limite exige risco aceito e alerta de linhas antigas bloqueadas por sucessoras. |

As decisões devem identificar aprovador, data, ambiente, produto e versão e
entrar no pacote de release hash-bound. Sem elas, o job fica desabilitado e o
gate de produção permanece `NO_GO`.

O desenho recomendado é uma idade máxima **finita** para a família. O
`replace` atual preserva o mesmo `family_id` e pode prolongá-la
indefinidamente; a purga não deve apagar seus digests antigos enquanto uma
sucessora estiver ativa. Para impor um limite, será necessário definir em
revisão T3 como a autenticação MFA cria uma nova família e revoga a anterior
atomicamente, inclusive o significado de logout com cookie antigo após essa
troca. A opção de idade sem limite não é presumida nem autorizada por esta
SPEC; se o controlador a aceitar, deve registrar risco, finalidade, idade de
alerta e cadência de revisão antes de um novo desenho de BUILD.

## Contrato técnico proposto após aprovação

1. Migration incremental `0002_auth_purge.sql` no schema privado de
   autenticação, sem reescrever `0000`/`0001`. Uma tabela singleton
   `operator_auth_retention_policy` pertence à role de migração, tem
   `ENABLE/FORCE RLS`, política somente para o owner e chave
   `policy_id smallint PRIMARY KEY CHECK (policy_id = 1)`. Os campos
   `state_retention_seconds integer` e `session_retention_seconds integer`
   são `NOT NULL` com `CHECK` de `0..31536000` (até 365 dias como limite
   técnico; prazo maior exige revisão da SPEC), e `decision_ref` é texto
   não vazio, limitado a 128 caracteres, sem dado pessoal. A migration
   insere **exatamente uma** linha com os valores aprovados; não há defaults
   nem `UPDATE` para a role de API ou de purge. Uma função somente leitura
   `operator_auth_policy_attest()` pertence ao owner, é `SECURITY DEFINER`,
   é `VOLATILE`, tem `search_path` fixo e retorna apenas `decision_ref` e os
   dois prazos.
   Ela exige exatamente uma linha e domínio válido; não retorna digests nem
   IDs de operador. A role da API e a role de purge recebem somente
   `EXECUTE` nessa função, nunca `SELECT` na tabela. O preflight chama a
   função para exigir cardinalidade de uma linha e comparar a tupla exata
   com o manifesto aprovado do deployment, além de conferir PK,
   `CHECK`s, owner, corpo e ACL. A função de purge lê a linha antes de
   qualquer `DELETE` e falha fechada se ela faltar, estiver duplicada ou
   violar domínio, mesmo sob alteração adversarial do catálogo. Mudar prazo
   exige nova migration e decisão registrada. DP-06 ainda pode exigir
   coluna de idade da família e função de troca, definidas após a decisão.
2. Uma função `operator_auth_purge(p_limit integer,
p_expected_decision_ref text, p_expected_state_seconds integer,
p_expected_session_seconds integer)` pertence ao owner e é
   `SECURITY DEFINER` e `VOLATILE`, com SQL estático, objetos qualificados e
   `SET search_path = pg_catalog, pg_temp`. Ela rejeita limites fora de
   `1..1000` e exige `current_setting('transaction_isolation') = 'read committed'`;
   o job usa esse isolamento em cada chamada. A função obtém `LOCK TABLE`
   em modo `SHARE` na tabela de policy **antes de lê-la**,
   valida que há exatamente uma linha e a mantém estável até o commit.
   **Antes de qualquer `DELETE`** compara a tupla com os três valores
   esperados. Só então calcula cutoffs
   com a tupla **do banco** e um instante do relógio do banco. Os parâmetros
   esperados são comparadores, não cutoffs nem duração escolhida pelo caller;
   a função não aceita cutoff ou tenant fornecido pelo caller. `PUBLIC`
   perde `EXECUTE` na mesma transação de criação; uma role exclusiva
   `auth_purge` recebe apenas `USAGE` no schema e `EXECUTE` nas funções de
   attest e purge. Não recebe DML de tabela, DDL, membership nem funções de
   sessão/login.
3. A função elimina states apenas se `expires_at <= now - R_state`. Para
   sessões, trava a linha da família antes de avaliar filhos, na mesma ordem
   usada por `replace` e `revoke`. Só pode eliminar linhas de uma família se
   **todas** as sessões dela tiverem `expires_at <= now - R_session`; assim
   não apaga o digest antigo enquanto uma sucessora ainda pode funcionar.
   Usa `SKIP LOCKED` para famílias concorrentes, reavalia elegibilidade sob
   lock e limita o total de linhas eliminadas das três tabelas a 1.000 por
   chamada. Uma família com mais de 1.000 sessões pode ser drenada em lotes
   somente depois de toda a linhagem ser elegível; a linha da família é
   apagada quando não restar filho. O orçamento do lote é dividido entre
   state e famílias/sessões com reaproveitamento da parte ociosa, para que
   fluxo contínuo de state não impeça o expurgo de sessões, ou vice-versa.
   Chamadas repetidas são idempotentes.
4. Um job descartável, fora da API e do worker, roda a cada dez
   minutos com URL exclusiva `AUTH_PURGE_DATABASE_URL`, pool e query timeout
   limitados. Ele chama `operator_auth_policy_attest()`, compara a tupla
   com o manifesto aprovado do deployment e passa os mesmos três valores
   esperados à função de purge dentro de uma transação explícita
   `BEGIN ISOLATION LEVEL READ COMMITTED`/`COMMIT`, com timeout e rollback
   em erro. A função repete a comparação dentro da própria transação e antes
   do primeiro `DELETE`; divergência ou mudança
   concorrente impede a execução. Não registra digests, operador, tenant, cookie, token
   ou state. Publica apenas contagens agregadas, duração, falha, idade da
   linha **elegível** mais antiga e idade/contagem das linhas antigas
   bloqueadas por sucessoras ativas. Alerta se a idade elegível superar uma
   hora ou o backlog elegível passar de 100 mil, além de falhas consecutivas
   e do limite aprovado em DP-06 para linhas bloqueadas. A referência a
   elegibilidade evita alarme permanente quando uma retenção aprovada
   superar uma hora, sem esconder linhagens prolongadas.
   A ordem lock → leitura segue o [contrato de lock do PostgreSQL 16](https://www.postgresql.org/docs/16/sql-lock.html):
   `SHARE` impede escritores concorrentes em `READ COMMITTED`, enquanto um
   snapshot anterior de `REPEATABLE READ` não é atualizado pelo lock.
5. O preflight de autenticação passa a verificar a tabela/policy singleton,
   as duas funções novas vivas, assinaturas, corpos, volatilidade, owner,
   ACL, RLS, grants
   e role de purge, mantendo a allowlist exata da role da API: seis funções
   existentes mais `operator_auth_policy_attest()`, sem `EXECUTE` em purge.
   A prova de runtime confirma que a API não recebe
   `AUTH_PURGE_DATABASE_URL`, não tem `SELECT` direto da policy nem pode
   chamar purge.

## Rollout e recuperação

O preflight atual exige exatamente quatro relações e seis funções no schema
de autenticação; também rejeita grants extras no schema. `0002` acrescentará
tabela, policy, índice e duas funções; a role de purge é pré-provisionada sem
grants e recebe apenas os grants específicos na migration. Um binário antigo pode continuar
servindo mesmo depois de a migration mudar o banco, pois o preflight só roda
no startup. A sequência de rollout deve ser uma condição verificável, não
uma suposição baseada na prontidão de um único pod.

| Etapa | Banco                                        | Réplicas autorizadas                                                        | Purge                        |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| A0    | Inventário `0000` + `0001`                   | Binário atual ou compatível                                                 | Desligado                    |
| A1    | Inventário `0000` + `0001`                   | Somente release de compatibilidade após drenar **todas** as réplicas atuais | Desligado                    |
| A2    | Inventário `0000` + `0001` + `0002` completo | Release de compatibilidade; binário atual proibido                          | Desligado                    |
| A3    | Mesmo inventário `0002` completo             | Release compatível e release final coexistem durante a troca                | Desligado até GO             |
| A4    | Mesmo inventário `0002` completo             | Release final com preflight estrito `0002`                                  | Job autorizado separadamente |

O release de compatibilidade não faz migration nem recebe credencial DDL.
Seu preflight aceita **exatamente** o inventário completo `0000` + `0001`
ou o inventário completo `0000` + `0001` + `0002`; não aceita um subconjunto,
objetos desconhecidos ou ACLs ampliadas. No caso `0002`, verifica também
owner, RLS, constraints, índice, corpo/assinatura/ACL da função de purge,
policy singleton válida via attest e acesso exclusivo da role de purge à
função destrutiva. A role da API continua sem `EXECUTE` da função de purge,
DML direto ou membership. A
compatibilidade consulta o catálogo e chama `operator_auth_policy_attest()`
somente para leitura da policy: não ativa purge nem cria state ou sessão por
outra interface. O release final volta a exigir somente
`0002` completo. Os valores da policy vêm das decisões DP-01 a DP-06 e do
manifesto do deployment, nunca de um default embutido no binário.
O runner de migration deve exigir alvo/versionamento explícito e autorização
do rollout para `0002`; somente distribuir o arquivo SQL no release de
compatibilidade não pode aplicar `0002` por execução automática de
"migrar até a última versão". O gate externo compara o digest do release,
o alvo, a policy aprovada e o inventário de réplicas antes de liberar o job.

Depois de instalar A1 em todas as réplicas e provar zero instâncias do
binário estrito antigo, a operação distribui o manifesto de policy aprovado
para **cada** réplica compatível e reinicia as réplicas que precisarem
recarregar essa configuração. O gate confirma a mesma referência, valores
e digest em todas elas antes de DDL. A operação provisiona previamente a role de purge
sem grants e sem acesso da API; a role de migration não recebe
`CREATEROLE`. O job DDL separado aplica `0002` e os grants em uma
transação; a versão e checksum são verificados. Para declarar A2, faz-se
restart gradual das réplicas compatíveis para rerodar o preflight contra
`0002`, seguido de leitura/criação/revogação de sessão entre duas réplicas
sintéticas. O release final é certificado em staging com o mesmo digest e
configuração candidata antes de A3; sua implantação e a ativação do job em
A4 exigem seus gates e autorizações próprios. Se a drenagem não for
comprovada, `0002` não roda. As
decisões DP-01 a DP-06 e a revisão T3 precisam estar aprovadas **antes** de
semear valores em `0002`.

Rollback de A3/A4 desliga o job e volta a A1/A2, mantendo o schema `0002` e
sem restaurar linhas eliminadas. Depois de A2, o binário estrito antigo
deixa de ser destino válido de rollback; restaurá-lo exigiria outra
migration e revisão T3. O runbook de PITR deve bloquear serving ou revogar
todas as sessões restauradas até revalidar relógio, policy e purge, pois um
snapshot recente poderia ressuscitar uma sessão ainda dentro dos 15 minutos
de validade.

## Prova exigida

- PostgreSQL 16 descartável com duas réplicas e dois jobs concorrentes:
  state expirado/não expirado, consumo concorrente, `replace` e logout em
  ambas as ordens, cookie antigo após várias trocas e família parcialmente
  drenada com mais de 1.000 linhas. Nenhuma sessão ativa perde seu ancestral.
- Negativos: `PUBLIC` ou API com `EXECUTE`/DML de purge, role com DDL ou
  membership, política ausente/duplicada/alterada, duração negativa ou acima
  do limite, zero segundos apagando state ainda válido, body/ACL/RLS/index/
  owner alterados, attest omitido/adulterado, manifesto ausente/divergente,
  troca da policy entre attest e purge, transação `REPEATABLE READ` ou
  `SERIALIZABLE` que tenha lido a policy antiga antes do lock, cutoff enviado pelo caller,
  falha/timeout do banco e 1.001 exclusões numa chamada. Falha fecha sem
  fallback para a API.
- Série de reautenticações que prolonga a mesma família: prova do limite
  aprovado em DP-06 ou, se houver decisão expressa de idade sem limite,
  prova de telemetria/alerta de digests antigos bloqueados. Não chamar o
  backlog somente elegível de cobertura completa de retenção.
- Coexistência antes/depois da migration, rollback sem restauração de dados,
  restauração PITR sintética, reexpurgo, métricas/alertas, volume sintético de
  100 mil linhas e plano de consulta sem varredura degradante sustentada.
  Na prova de coexistência, o binário antigo deve falhar no startup contra
  `0002`, o compatível deve passar nos dois inventários completos, e ambos
  devem recusar um inventário parcial, grant extra ou policy adulterada. A
  orquestração deve bloquear a migration enquanto houver uma réplica antiga
  pronta ou em trânsito; após `0002`, deve rejeitar rollback para ela, mesmo
  que uma instância antiga já iniciada ainda responda a `/health`.
  Deve também negar uma tentativa de runner sem alvo explícito ou com alvo
  `0002` antes do gate de drenagem e da policy aprovada.
  Com lote de 1.000 a cada dez minutos, a capacidade nominal máxima é
  100 linhas por minuto; a prova de carga deve demonstrar que a taxa esperada
  fica abaixo disso e que ambas as filas avançam. Caso contrário, revisar
  cadência ou lote na SPEC antes de afirmar prontidão.
- Node 22: `typecheck`, `lint`, `npm test`, `test:postgres`, E2E OIDC confiável,
  certificação do SHA integrado e revisão adversarial independente. A prova
  deve vincular valores aprovados, migration, imagem, logs e configuração do
  job ao mesmo candidato; dados reais continuam proibidos até GO humano.

## Estado

`SPEC_REVIEW_READY / DPO_POLICY_PENDING / FAMILY_CONTRACT_PENDING / BUILD_NOT_STARTED / PRODUCTION_NO_GO`.
