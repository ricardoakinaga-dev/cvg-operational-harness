# AUD-0582 — lacuna do boot OIDC corporativo

- Data: 27/09/2026. Escopo: código do branch isolado `codex/pr204-boot-20260927` em `99692e3`, contrato [0144](../02_spec/0144_trusted_operator_session_production.md), configuração [0151](../02_spec/0151_production_boot_configuration_contract.md) e transporte [0150](../02_spec/0150_cross_origin_operator_console.md). Inspeção estática; nenhuma credencial, IdP corporativo ou dado real foi usado.
- Veredito: `PRODUCTION_IDENTITY_BOOT_MISSING / NO_GO`. A falha fechada é correta para o candidato atual, mas não satisfaz o boot positivo nem o requisito 5 do [plano 0354](../03_build/0354_production_executive_plan_2026-09-26.md).

## Evidência observada

1. `apps/api/src/main.ts` cria o snapshot e não constrói resolver HMAC em produção. `apps/api/src/server.ts` rejeita produção antes de abrir o servidor, tanto em `buildServerWithProfile` quanto em `buildServerFromSnapshot`, com erro de autoridade OIDC indisponível. O teste de fronteira comprova a rejeição; não há caminho positivo.
2. `apps/api/src/local-oidc-composition.ts` aceita somente `development` e `test`, exige PostgreSQL de autenticação com role separada e compõe o cliente local. `apps/api/src/oidc-client-local.ts` exige issuer e redirect HTTP em loopback, client público `token_endpoint_auth_method: none`, discovery/JWKS e PKCE. O mapeador `oidc-identity.ts` exige `amr` com `pwd` e `otp` e grupo no formato local. Esses contratos não podem ser promovidos por troca de `NODE_ENV`.
3. O contrato de cookie, CORS, CSRF e hosts HTTPS distintos está na SPEC 0150, ainda sem aprovação T3 para BUILD. O IdP corporativo, método de autenticação do client e semântica dos claims não foram fornecidos; D-09 escolhe apenas a direção OIDC com MFA. A SPEC 0144 autoriza IdP local sintético para desenvolvimento/homologação, não integração corporativa.
4. A prova PR‑204 registra 333/2.477 testes com cobertura, PostgreSQL 35/258, Chromium 12/12 e imagem web selada. Esses gates exercitam o modo controlado e a rejeição produtiva; não provam login corporativo nem topologia HTTPS de produção.

## Decisão de engenharia e próxima prova

- Abrir [SPEC 0152](../02_spec/0152_corporate_oidc_authority_contract.md) T3 para separar a autoridade corporativa do adapter local, declarar parâmetros obrigatórios e negativos de issuer, client, MFA, grupo, sessão e rollback. A implementação só começa após revisão humana explícita dessa SPEC.
- A prova inicial pode usar emissor HTTPS e identidades sintéticos, sem ativar IdP real. A prova final exige parâmetros aprovados pela equipe IAM, ambiente staging, SPEC 0150 implementada, digest integrado, certificação e decisão de release separada. Até lá, produção permanece `NO_GO`.
