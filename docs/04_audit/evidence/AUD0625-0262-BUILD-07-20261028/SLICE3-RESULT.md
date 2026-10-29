# 0262 BUILD — fatia 3 (cookie ↔ principal.revision, Auth v2)

Branch claude/aud0625-0257-07. Implementação local; SPEC intacta.

## O que mudou
- `OperatorSessionRecord/Input.principalRevision` (1..MAX_SAFE_INTEGER, sem default); memória e PG gravam e devolvem o binding exato.
- Auth `operator-session/0002_principal_revision.sql`: coluna `principal_revision` (0 = legado, nunca corrente) + CHECK; DROP das três funções sem binding; `operator_session_create_v2/get_v2/replace_v2` (SECURITY DEFINER, search_path fixo, REVOKE PUBLIC); `replace_v2` exige tenant/operator/role/revisão iguais (mudança de revisão = nova família); `get_v2` filtra legado 0. Runner (`runOperatorSessionMigrations`, checksum próprio), `grantOperatorSessionFunctions` (seis assinaturas) e preflight (inventário, corpos, coluna, CHECK) atualizados; sonda de readiness em `get_v2`.
- `operator-session-binding.ts`: `readCurrentPrincipal` / `assertSessionBinding` (401 stale, 503 indisponível/sem authorityVersion) sobre `principalIsCurrent`, definição única compartilhada com `resolveCaseReadScope`.
- Hook de sessão: compara a revisão do cookie com o principal atual a cada request (401 + limpa cookie; 503 mantém cookie; nunca cai para "só a sessão").
- Criação: `produceVerifiedPrincipal` devolve o registro corrente; OIDC e `/v1/session` HMAC ligam o cookie a essa revisão; antes do Set-Cookie o principal é relido e, se mudou, a família nova é aposentada e nenhum cookie sai; rotação só com mesma revisão (senão `switchIdentity`).

## Provas
- Memória: hook 6/6 (binding atual, revisão movida após restauração de role = 401 e limpa, inativo/ausente 401, outage 503 mantém cookie, sem authorityVersion 503), operator-session 8/8 (rotação vs nova família, corrida hook→handler), oidc-login-routes 54+ (revisão 3 ligada; principal movido após create retira a família e não emite cookie).
- PG: operator-session-postgres 20/20 (v1 removidas, revisão inválida recusada, replace com revisão diferente 22023, legado 0 filtrado, objetos-isca/overload/CHECK removido recusam o serving), production-bootstrap-postgres-own 12/12, oidc-login(-entrypoint)-postgres e trusted-replay verdes.
- Mutantes (mutations-0262-s3.json): B1–B7; B4/B6 sobreviveram e foram mortos com os testes de corrida e de revisão 3; B7 (`principalIsCurrent` sem `active`) é equivalente — desativar sempre incrementa a revisão, e o binding o pega.
- Gates: typecheck/eslint 0; focado apps/api+persistence+web+journeys 1257 ok; skip:governance PASS (SKIP-PG-036 religado), mutation-guard 3/3.

## Consequências a levar à decisão humana (T3)
1. Com o binding, um cookie de sessão só vale com autoridade de principal configurada; a autoridade (`casePrincipalAuthority`) só é composta em NODE_ENV=test ou com OIDC (que não está qualificado fora de test). Logo, **o perfil de produção HMAC sem OIDC passa a responder 503 em toda rota com cookie** (SPEC §5 manda isso). `production-bootstrap-postgres-own` foi adaptado: servidor montado sob NODE_ENV=test, principais `verified_adapter`.
2. Mudança de role/revisão do principal invalida cookies antigos (R08), então "falha de switch mantém o cookie anterior" é provada no nível do store (sessão viva), não pela requisição HTTP (que dá 401).
3. 400/403 de handler podem virar 401/503 quando o principal já é inválido (SPEC §5).

## Fora desta fatia
Guard preHandler e inventário de rotas (fatia 4), invalidação global e `revoke-operator-sessions.ts` (fatia 5), docs 0107/0305.
