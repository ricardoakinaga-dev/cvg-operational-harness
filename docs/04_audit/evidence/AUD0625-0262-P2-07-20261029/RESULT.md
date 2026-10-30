# AUD0625 0262 — P2-1 e P3 da revisão D9 das fatias 3–5

Task `AUD0625-0262-P2-07-20261029` (Claude Sonnet, sessão 07). Branch
`claude/aud0625-0262-p2-07` sobre `claude/aud0625-wave3` `587eb217a`; sem push.
Revisão de origem: `AUD0625-REVIEW-0262-S345-D9-20261029`.

## P2-1 — `revoke-operator-sessions` aceitava atalhos de conexão

- `scripts/lib/operator-action-connect.ts` (novo): `scrubPgEnvironment` apaga
  toda `PG*` do ambiente; `poolConfigFor` recusa URL com `?` ou `#`, compara o
  perfil e devolve host, porta, banco, usuário, senha e `ssl: false` como campos
  explícitos do perfil; `createPool` só abre o pool assim.
- O script usa só `createPool`. Limite assumido: o perfil da política não tem
  campo de TLS, então `ssl` é `false` fixo (emenda da SPEC se o datastore exigir
  TLS); o P2 pedia "ssl a partir do perfil" e o perfil não o contém.
- Testes (`tests/operator-action-connect.test.ts`, 27): scrub (só nomes saem),
  config explícita, 9 URLs com query/fragmento recusadas, 6 divergências de
  perfil recusadas, `createPool` com shell hostil resolve para o perfil nos
  parâmetros reais do `pg`, e um controle que prova que sem o scrub o `pg`
  pegaria `PGPASSWORD` e `PGOPTIONS`.

## P3
- **P3-1** digest do artefato: `artifactSha256` (rótulo + bytes, ordem
  indiferente) sobre `INSTALLED_ARTIFACT_FILES` (script, lib, guarda de conexão,
  `case-authority.ts`, `case-authority-postgres.ts`); testes de mudança por
  arquivo, remoção, adição, renomeação e lista vazia; a lista existe em disco.
- **P3-2** `oidc-login-guards`: teste companheiro com autoridade e principais
  reais afirma a matriz (`/v1/cases` 403 para Operator/Approver, 200 para os
  demais; conversas e tarefas 200).
- **P3-3** `case-scope-tasks-approvals`: o ramo morto saiu do teste do 503;
  teste companheiro com principais reais afirma, nas oito rotas e quatro roles,
  403 `forbidden` fora de `permitted` (sem escrita) e 200/202/400/404/409 dentro.
- **P3-5** `FileStat.nlink`: política, prova e arquivo de conexão exigem
  `nlink === 1` (testes isolados com conteúdo válido).
- P3-4 é decisão do Ricardo (human-decisions-12), sem ação.

## Provas
- `tests/operator-action*.test.ts`: 3 arquivos, 83 testes; os dois arquivos de
  API: 35 testes; typecheck e eslint 0; prettier OK.
- Mutação (`mutate-p2.py`, 15 mutantes aplicáveis): 12 mortos
  (`mutations-p2.json`, `mutations-p2-rerun.json`). **P5–P7 sobrevivem e são
  equivalentes**: o perfil já foi comparado igual ao URL antes, então usar
  `url.hostname/port/database` ou `expected.*` dá o mesmo valor. P13 (nlink) e
  P15 foram mortos depois de testes dedicados; P14 deixou de existir ao
  remover o scrub redundante do `main`.
- O companheiro do P3-3/P3-2 não passou por mutação do registro de roles.

## Não executado
`--apply` real como root, PG, Docker, suíte global, T4.
